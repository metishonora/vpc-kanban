mod models;
mod db;
mod jira;

use axum::{
    routing::{get, post},
    extract::{State, Query as AxumQuery},
    Json, Router,
};
use std::net::SocketAddr;
use sqlx::{SqlitePool, Row};
use tower_http::services::ServeDir;
use tower_http::cors::{Any, CorsLayer};
use models::{Ticket, JiraQuery, Comment};
use jira::JiraClient;
use uuid::Uuid;
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

    // Seed data if empty
    seed_data(&state).await;

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/api/query", post(query_jira))
        .route("/api/tickets", get(get_tickets))
        .route("/api/tickets/:id/status", post(update_status))
        .route("/api/tickets/:id/assign", post(assign_ticket))
        .route("/api/tickets/:id/metadata", post(update_metadata))
        .route("/api/tickets/:id/comments", get(get_comments).post(add_comment))
        .nest_service("/", ServeDir::new("frontend"))
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3000));
    println!("Listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn seed_data(state: &AppState) {
    let count: i32 = sqlx::query_scalar("SELECT COUNT(*) FROM tickets")
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);
    
    if count == 0 {
        println!("Database empty. Seeding initial data...");
        let query = JiraQuery {
            project: Some("VPC".to_string()),
            user: None,
            start_date: None,
            end_date: None,
            query_string: None,
        };
        let tickets = state.jira.query_tickets(query).await;
        for ticket in tickets {
            let _ = sqlx::query(
                "INSERT INTO tickets (id, title, description, status, assignee, project_id, created_at, updated_at, ticket_type, parent_id, start_date, end_date, jira_url, is_deleted)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)"
            )
            .bind(&ticket.id)
            .bind(&ticket.title)
            .bind(&ticket.description)
            .bind(&ticket.status)
            .bind(&ticket.assignee)
            .bind(&ticket.project_id)
            .bind(ticket.created_at)
            .bind(ticket.updated_at)
            .bind(&ticket.ticket_type)
            .bind(&ticket.parent_id)
            .bind(ticket.start_date)
            .bind(ticket.end_date)
            .bind(&ticket.jira_url)
            .execute(&state.db)
            .await;
        }
    }
}

async fn query_jira(
    State(state): State<AppState>,
    Json(query): Json<JiraQuery>,
) -> Json<Vec<Ticket>> {
    let tickets = state.jira.query_tickets(query.clone()).await;
    let project_id = query.project.clone().unwrap_or_else(|| "DEFAULT".to_string());
    let mut fetched_ids = Vec::new();

    // Store fetched tickets in local DB (UPSERT)
    for ticket in &tickets {
        fetched_ids.push(ticket.id.clone());
        let result = sqlx::query(
            "INSERT INTO tickets (id, title, description, status, assignee, project_id, created_at, updated_at, ticket_type, parent_id, start_date, end_date, jira_url, is_deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
             ON CONFLICT(id) DO UPDATE SET
             title=excluded.title, description=excluded.description, assignee=excluded.assignee, updated_at=excluded.updated_at, 
             start_date=excluded.start_date, end_date=excluded.end_date, jira_url=excluded.jira_url, is_deleted=0"
        )
        .bind(&ticket.id)
        .bind(&ticket.title)
        .bind(&ticket.description)
        .bind(&ticket.status)
        .bind(&ticket.assignee)
        .bind(&ticket.project_id)
        .bind(ticket.created_at)
        .bind(ticket.updated_at)
        .bind(&ticket.ticket_type)
        .bind(&ticket.parent_id)
        .bind(ticket.start_date)
        .bind(ticket.end_date)
        .bind(&ticket.jira_url)
        .execute(&state.db)
        .await;

        if let Err(e) = result {
            eprintln!("Error persisting ticket {}: {}", ticket.id, e);
        }
    }

    // Mark missing tickets as deleted for this project
    if !fetched_ids.is_empty() {
        let query_builder = format!(
            "UPDATE tickets SET is_deleted = 1 WHERE project_id = ? AND id NOT IN ({})",
            fetched_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",")
        );
        let mut q = sqlx::query(&query_builder).bind(&project_id);
        for id in fetched_ids {
            q = q.bind(id);
        }
        let _ = q.execute(&state.db).await;
    }

    Json(tickets)
}

async fn update_metadata(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> Json<bool> {
    let alias = payload.get("alias").and_then(|v| v.as_str());
    let tags = payload.get("tags").and_then(|v| v.as_str());
    let keywords = payload.get("keywords").and_then(|v| v.as_str());
    let related = payload.get("related_tickets").and_then(|v| v.as_str());

    let result = sqlx::query(
        "UPDATE tickets SET alias = ?, tags = ?, keywords = ?, related_tickets = ?, updated_at = ? WHERE id = ?"
    )
    .bind(alias)
    .bind(tags)
    .bind(keywords)
    .bind(related)
    .bind(Utc::now())
    .bind(id)
    .execute(&state.db)
    .await;
    
    Json(result.is_ok())
}

async fn get_tickets(
    State(state): State<AppState>,
) -> Json<Vec<Ticket>> {
    let tickets = sqlx::query_as::<_, Ticket>("SELECT * FROM tickets")
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();
    Json(tickets)
}

async fn update_status(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(status): Json<String>,
) -> Json<bool> {
    let result = sqlx::query("UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?")
        .bind(status)
        .bind(Utc::now())
        .bind(id)
        .execute(&state.db)
        .await;
    Json(result.is_ok())
}

async fn assign_ticket(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(assignee): Json<String>,
) -> Json<bool> {
    let result = sqlx::query("UPDATE tickets SET assignee = ?, updated_at = ? WHERE id = ?")
        .bind(assignee)
        .bind(Utc::now())
        .bind(id)
        .execute(&state.db)
        .await;
    Json(result.is_ok())
}

async fn get_comments(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Json<Vec<Comment>> {
    let comments = sqlx::query_as::<_, Comment>("SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at DESC")
        .bind(id)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();
    Json(comments)
}

async fn add_comment(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(payload): Json<serde_json::Value>,
) -> Json<bool> {
    let author = payload.get("author").and_then(|v| v.as_str()).unwrap_or("Anonymous");
    let content = payload.get("content").and_then(|v| v.as_str()).unwrap_or("");
    let attachments = payload.get("attachments").map(|v| v.to_string());
    
    let comment_id = Uuid::new_v4().to_string();
    let result = sqlx::query(
        "INSERT INTO comments (id, ticket_id, author, content, created_at, attachments)
         VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(comment_id)
    .bind(id)
    .bind(author)
    .bind(content)
    .bind(Utc::now())
    .bind(attachments)
    .execute(&state.db)
    .await;
    
    Json(result.is_ok())
}
