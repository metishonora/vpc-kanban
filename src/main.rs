mod models;
mod db;
mod jira;

use axum::{
    routing::{get, post, put, delete as axum_delete},
    extract::{State, Path},
    Json, Router,
};
use std::net::SocketAddr;
use sqlx::SqlitePool;
use tower_http::services::ServeDir;
use tower_http::cors::{Any, CorsLayer};
use models::{
    JiraTicket, JiraQuery,
    Task, TaskComment,
    CreateTaskRequest, UpdateTaskRequest, UpdateStatusRequest,
    AddToKanbanRequest,
};
use jira::JiraClient;
use chrono::Utc;

#[derive(Clone)]
struct AppState {
    db: SqlitePool,
    jira: std::sync::Arc<JiraClient>,
}

#[tokio::main]
async fn main() {
    let pool = db::init_db().await.expect("Failed to initialize database");
    let state = AppState {
        db: pool,
        jira: std::sync::Arc::new(JiraClient::new()),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        // Backlog: Jira 티켓 조회 (DB 저장 없음)
        .route("/api/backlog/query", post(query_backlog))
        // Tasks: kanban 일감 관리
        .route("/api/tasks", get(list_tasks).post(create_task))
        .route("/api/tasks/from-backlog", post(add_tasks_from_backlog))
        .route("/api/tasks/:id", put(update_task))
        .route("/api/tasks/:id", axum_delete(delete_task))
        .route("/api/tasks/:id/status", post(update_task_status))
        .route("/api/tasks/:id/comments", get(list_task_comments).post(add_task_comment))
        .nest_service("/", ServeDir::new("frontend"))
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Listening on http://{}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// ─── Backlog ─────────────────────────────────────────────────────────────────

/// Jira 티켓 조회. DB에 저장하지 않음.
async fn query_backlog(
    State(state): State<AppState>,
    Json(query): Json<JiraQuery>,
) -> Json<Vec<JiraTicket>> {
    let tickets = state.jira.query_tickets(query).await;
    Json(tickets)
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

/// 모든 Task 목록 조회 (트리 구조를 위해 flat list 반환, 프론트에서 재구성)
async fn list_tasks(State(state): State<AppState>) -> Json<Vec<Task>> {
    let tasks = sqlx::query_as::<_, Task>(
        "SELECT * FROM tasks ORDER BY parent_task_id NULLS FIRST, id ASC"
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();
    Json(tasks)
}

/// 새 Task 생성 (수동)
async fn create_task(
    State(state): State<AppState>,
    Json(req): Json<CreateTaskRequest>,
) -> Json<Option<Task>> {
    let result = sqlx::query(
        "INSERT INTO tasks (jira_ticket_key, title, description, status, assignee, project_key,
                            parent_task_id, alias, start_date, due_date, jira_url)
         VALUES (?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&req.jira_ticket_key)
    .bind(&req.title)
    .bind(&req.description)
    .bind(&req.assignee)
    .bind(&req.project_key)
    .bind(req.parent_task_id)
    .bind(&req.alias)
    .bind(req.start_date.map(|d| d.to_string()))
    .bind(req.due_date.map(|d| d.to_string()))
    .bind(&req.jira_url)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) => {
            let task = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
                .bind(r.last_insert_rowid())
                .fetch_optional(&state.db)
                .await
                .unwrap_or(None);
            Json(task)
        }
        Err(e) => {
            eprintln!("Error creating task: {}", e);
            Json(None)
        }
    }
}

/// Backlog에서 선택한 Jira 티켓들을 Task로 변환하여 추가
/// include_subtasks=true이면 subtask도 함께 추가
async fn add_tasks_from_backlog(
    State(state): State<AppState>,
    Json(req): Json<AddToKanbanRequest>,
) -> Json<Vec<Task>> {
    // 요청된 티켓들을 Jira에서 조회하기 위해 mock에서 전체 조회
    let all_tickets = state.jira.query_tickets(JiraQuery {
        project: None,
        user: None,
        start_date: None,
        end_date: None,
        query_string: None,
    }).await;

    // flat하게 풀어서 key → JiraTicket 맵 구성
    let mut ticket_map: std::collections::HashMap<String, models::JiraTicket> = std::collections::HashMap::new();
    fn flatten(tickets: Vec<models::JiraTicket>, map: &mut std::collections::HashMap<String, models::JiraTicket>) {
        for mut t in tickets {
            let children = std::mem::take(&mut t.subtasks);
            map.insert(t.key.clone(), t);
            flatten(children, map);
        }
    }
    flatten(all_tickets, &mut ticket_map);

    let mut created_tasks: Vec<Task> = Vec::new();

    for key in &req.ticket_keys {
        if let Some(ticket) = ticket_map.get(key) {
            // 이미 같은 jira_ticket_key로 존재하는지 확인
            let existing: Option<Task> = sqlx::query_as::<_, Task>(
                "SELECT * FROM tasks WHERE jira_ticket_key = ?"
            )
            .bind(&ticket.key)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);

            let parent_id = if let Some(existing) = existing {
                existing.id
            } else {
                let r = sqlx::query(
                    "INSERT INTO tasks (jira_ticket_key, title, description, status, assignee,
                                       project_key, start_date, due_date, jira_url)
                     VALUES (?, ?, ?, 'Pending', ?, ?, ?, ?, ?)"
                )
                .bind(&ticket.key)
                .bind(&ticket.title)
                .bind(&ticket.description)
                .bind(&ticket.assignee)
                .bind(&ticket.project_key)
                .bind(ticket.start_date.map(|d| d.to_string()))
                .bind(ticket.due_date.map(|d| d.to_string()))
                .bind(&ticket.jira_url)
                .execute(&state.db)
                .await
                .unwrap();
                let inserted_id = r.last_insert_rowid();
                if let Ok(Some(t)) = sqlx::query_as::<_, Task>("SELECT * FROM tasks WHERE id = ?")
                    .bind(inserted_id)
                    .fetch_optional(&state.db)
                    .await
                {
                    created_tasks.push(t);
                }
                inserted_id
            };

            // subtask도 추가
            if req.include_subtasks {
                // ticket_map에서 parent_key가 이 티켓인 것들 찾기
                let subtask_keys: Vec<String> = ticket_map
                    .values()
                    .filter(|t| t.parent_key.as_deref() == Some(key))
                    .map(|t| t.key.clone())
                    .collect();

                for sub_key in subtask_keys {
                    if let Some(sub_ticket) = ticket_map.get(&sub_key) {
                        let already: Option<Task> = sqlx::query_as::<_, Task>(
                            "SELECT * FROM tasks WHERE jira_ticket_key = ?"
                        )
                        .bind(&sub_ticket.key)
                        .fetch_optional(&state.db)
                        .await
                        .unwrap_or(None);

                        if already.is_none() {
                            let sr = sqlx::query(
                                "INSERT INTO tasks (jira_ticket_key, title, description, status,
                                                    assignee, project_key, parent_task_id,
                                                    start_date, due_date, jira_url)
                                 VALUES (?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?)"
                            )
                            .bind(&sub_ticket.key)
                            .bind(&sub_ticket.title)
                            .bind(&sub_ticket.description)
                            .bind(&sub_ticket.assignee)
                            .bind(&sub_ticket.project_key)
                            .bind(parent_id)
                            .bind(sub_ticket.start_date.map(|d| d.to_string()))
                            .bind(sub_ticket.due_date.map(|d| d.to_string()))
                            .bind(&sub_ticket.jira_url)
                            .execute(&state.db)
                            .await
                            .unwrap();
                            if let Ok(Some(t)) = sqlx::query_as::<_, Task>(
                                "SELECT * FROM tasks WHERE id = ?"
                            )
                            .bind(sr.last_insert_rowid())
                            .fetch_optional(&state.db)
                            .await
                            {
                                created_tasks.push(t);
                            }
                        }
                    }
                }
            }
        }
    }

    Json(created_tasks)
}

/// Task 업데이트 (alias, dates, 메타데이터 등)
async fn update_task(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateTaskRequest>,
) -> Json<bool> {
    let result = sqlx::query(
        "UPDATE tasks SET
            title       = COALESCE(?, title),
            description = COALESCE(?, description),
            status      = COALESCE(?, status),
            stage       = COALESCE(?, stage),
            assignee    = COALESCE(?, assignee),
            alias       = COALESCE(?, alias),
            tags        = COALESCE(?, tags),
            keywords    = COALESCE(?, keywords),
            start_date  = COALESCE(?, start_date),
            due_date    = COALESCE(?, due_date),
            updated_at  = ?
         WHERE id = ?"
    )
    .bind(&req.title)
    .bind(&req.description)
    .bind(&req.status)
    .bind(&req.stage)
    .bind(&req.assignee)
    .bind(&req.alias)
    .bind(&req.tags)
    .bind(&req.keywords)
    .bind(req.start_date.map(|d| d.to_string()))
    .bind(req.due_date.map(|d| d.to_string()))
    .bind(Utc::now())
    .bind(id)
    .execute(&state.db)
    .await;

    Json(result.is_ok())
}

/// Task 상태/단계 변경
async fn update_task_status(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(req): Json<UpdateStatusRequest>,
) -> Json<bool> {
    // Done으로 가면 stage 초기화
    let stage = if req.status == "Done" || req.status == "Pending" {
        None
    } else {
        req.stage.as_deref()
    };

    let result = sqlx::query(
        "UPDATE tasks SET status = ?, stage = ?, updated_at = ? WHERE id = ?"
    )
    .bind(&req.status)
    .bind(stage)
    .bind(Utc::now())
    .bind(id)
    .execute(&state.db)
    .await;

    Json(result.is_ok())
}

/// Task 삭제
async fn delete_task(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Json<bool> {
    let result = sqlx::query("DELETE FROM tasks WHERE id = ?")
        .bind(id)
        .execute(&state.db)
        .await;
    Json(result.is_ok())
}

// ─── Task Comments ────────────────────────────────────────────────────────────

async fn list_task_comments(
    State(state): State<AppState>,
    Path(task_id): Path<i64>,
) -> Json<Vec<TaskComment>> {
    let comments = sqlx::query_as::<_, TaskComment>(
        "SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC"
    )
    .bind(task_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();
    Json(comments)
}

async fn add_task_comment(
    State(state): State<AppState>,
    Path(task_id): Path<i64>,
    Json(payload): Json<serde_json::Value>,
) -> Json<bool> {
    let author = payload.get("author").and_then(|v| v.as_str()).unwrap_or("익명");
    let content = payload.get("content").and_then(|v| v.as_str()).unwrap_or("");
    let attachments = payload.get("attachments").and_then(|v| v.as_str());

    let result = sqlx::query(
        "INSERT INTO task_comments (task_id, author, content, attachments)
         VALUES (?, ?, ?, ?)"
    )
    .bind(task_id)
    .bind(author)
    .bind(content)
    .bind(attachments)
    .execute(&state.db)
    .await;

    Json(result.is_ok())
}
