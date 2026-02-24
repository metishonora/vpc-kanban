use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};

pub async fn init_db() -> Result<SqlitePool, sqlx::Error> {
    let database_url = "sqlite:kanban.db";

    if !std::path::Path::new("kanban.db").exists() {
        std::fs::File::create("kanban.db").unwrap();
    }

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await?;

    // Tasks 테이블: kanban에 추가된 일감. 영구 저장.
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS tasks (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            jira_ticket_key TEXT,
            title           TEXT NOT NULL,
            description     TEXT,
            status          TEXT NOT NULL DEFAULT 'Pending',
            stage           TEXT,
            assignee        TEXT,
            project_key     TEXT,
            parent_task_id  INTEGER REFERENCES tasks(id),
            alias           TEXT,
            tags            TEXT,
            keywords        TEXT,
            start_date      TEXT,
            due_date        TEXT,
            jira_url        TEXT,
            created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"
    )
    .execute(&pool)
    .await?;

    // Task comments
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS task_comments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            author      TEXT NOT NULL,
            content     TEXT NOT NULL,
            attachments TEXT,
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"
    )
    .execute(&pool)
    .await?;

    Ok(pool)
}
