use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use chrono::{DateTime, Utc};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Ticket {
    pub id: String, // JIRA key or internal ID
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub assignee: Option<String>,
    pub project_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub ticket_type: String, // "Task", "Deployment", etc.
    pub parent_id: Option<String>, // For sub-tasks of a deployment ticket
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    // New fields
    pub jira_url: Option<String>,
    pub alias: Option<String>,
    pub tags: Option<String>,
    pub keywords: Option<String>,
    pub related_tickets: Option<String>,
    pub is_deleted: bool,
}

#[derive(Debug, Serialize, Deserialize, FromRow, Clone)]
pub struct Comment {
    pub id: String,
    pub ticket_id: String,
    pub author: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub attachments: Option<String>, // JSON or comma-separated links
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JiraQuery {
    pub user: Option<String>,
    pub project: Option<String>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub query_string: Option<String>,
}
