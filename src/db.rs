use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::env;

pub async fn init_db() -> Result<SqlitePool, sqlx::Error> {
    let database_url = "sqlite:kanban.db";
    
    // Create database file if it doesn't exist
    if !std::path::Path::new("kanban.db").exists() {
        std::fs::File::create("kanban.db").unwrap();
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await?;

    // Create tables
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS tickets (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL,
            assignee TEXT,
            project_id TEXT NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            ticket_type TEXT NOT NULL,
            parent_id TEXT,
            start_date DATETIME,
            end_date DATETIME,
            jira_url TEXT,
            alias TEXT,
            tags TEXT,
            keywords TEXT,
            related_tickets TEXT,
            is_deleted BOOLEAN NOT NULL DEFAULT 0
        )"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS comments (
            id TEXT PRIMARY KEY,
            ticket_id TEXT NOT NULL,
            author TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME NOT NULL,
            attachments TEXT,
            FOREIGN KEY (ticket_id) REFERENCES tickets(id)
        )"
    ).execute(&pool).await?;

    Ok(pool)
}
