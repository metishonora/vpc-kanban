package db

import (
	"log"
	"os"
	"path/filepath"

	"github.com/jmoiron/sqlx"
	_ "github.com/mattn/go-sqlite3"
)

func InitDB() (*sqlx.DB, error) {
	// Root dir의 kanban.db 사용 (Go 백엔드를 backend-go/ 에서 실행하지만 DB는 그 상위에 있음)
	dbPath := filepath.Join("..", "kanban.db")
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		file, err := os.Create(dbPath)
		if err != nil {
			return nil, err
		}
		file.Close()
	}

	db, err := sqlx.Connect("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(5)

	tasksSchema := `
	CREATE TABLE IF NOT EXISTS tasks (
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
	);`
	_, err = db.Exec(tasksSchema)
	if err != nil {
		log.Printf("Failed to create tasks table: %v", err)
		return nil, err
	}

	commentsSchema := `
	CREATE TABLE IF NOT EXISTS task_comments (
		id          INTEGER PRIMARY KEY AUTOINCREMENT,
		task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
		author      TEXT NOT NULL,
		content     TEXT NOT NULL,
		attachments TEXT,
		created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);`
	_, err = db.Exec(commentsSchema)
	if err != nil {
		log.Printf("Failed to create task_comments table: %v", err)
		return nil, err
	}

	return db, nil
}
