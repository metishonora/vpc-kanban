use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, Utc, NaiveDate};

// ─────────────────────────────────────────────
// Jira 티켓: 조회 전용, DB에 저장하지 않음
// ─────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JiraTicket {
    pub key: String,           // e.g. "VPC-101"
    pub title: String,
    pub description: Option<String>,
    pub jira_status: String,   // Jira 내부 상태 (To Do, In Progress 등)
    pub assignee: Option<String>,
    pub project_key: String,
    pub ticket_type: String,   // "Story", "Task", "Bug", "Epic" 등
    pub parent_key: Option<String>,
    pub subtasks: Vec<JiraTicket>, // contain된 하위 티켓들
    pub start_date: Option<NaiveDate>,
    pub due_date: Option<NaiveDate>,
    pub created_at: DateTime<Utc>,
    pub jira_url: Option<String>,
}

// ─────────────────────────────────────────────
// Task: kanban에 추가된 일감. DB에 영구 저장.
// ─────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Task {
    pub id: i64,
    pub jira_ticket_key: Option<String>, // 연결된 Jira 티켓 키 (backlog에서 추가 시)
    pub title: String,
    pub description: Option<String>,
    pub status: String,          // "Pending" | "InProgress" | "Done"
    pub stage: Option<String>,   // InProgress 세부 단계: 사양확인|CCB|개발|검증|리뷰
    pub assignee: Option<String>,
    pub project_key: Option<String>,
    pub parent_task_id: Option<i64>, // contain 관계의 상위 task
    pub alias: Option<String>,
    pub tags: Option<String>,
    pub keywords: Option<String>,
    pub start_date: Option<NaiveDate>,
    pub due_date: Option<NaiveDate>,
    pub jira_url: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// ─────────────────────────────────────────────
// Task Comment
// ─────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct TaskComment {
    pub id: i64,
    pub task_id: i64,
    pub author: String,
    pub content: String,
    pub attachments: Option<String>,
    pub created_at: DateTime<Utc>,
}

// ─────────────────────────────────────────────
// Request / Response DTOs
// ─────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JiraQuery {
    pub project: Option<String>,
    pub user: Option<String>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub query_string: Option<String>, // raw JQL
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddToKanbanRequest {
    pub ticket_keys: Vec<String>,    // 선택된 Jira 티켓 키들
    pub include_subtasks: bool,      // contain된 하위 티켓도 포함할지
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTaskRequest {
    pub title: String,
    pub description: Option<String>,
    pub jira_ticket_key: Option<String>,
    pub assignee: Option<String>,
    pub project_key: Option<String>,
    pub parent_task_id: Option<i64>,
    pub alias: Option<String>,
    pub start_date: Option<NaiveDate>,
    pub due_date: Option<NaiveDate>,
    pub jira_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub stage: Option<String>,
    pub assignee: Option<String>,
    pub alias: Option<String>,
    pub tags: Option<String>,
    pub keywords: Option<String>,
    pub start_date: Option<NaiveDate>,
    pub due_date: Option<NaiveDate>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateStatusRequest {
    pub status: String,
    pub stage: Option<String>,
}
