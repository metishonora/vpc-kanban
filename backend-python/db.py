import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'kanban.db')

def init_db():
    if not os.path.exists(DB_PATH):
        open(DB_PATH, 'a').close()
        
    with get_db() as conn:
        conn.execute('''
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
        )
        ''')

        conn.execute('''
        CREATE TABLE IF NOT EXISTS task_comments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            author      TEXT NOT NULL,
            content     TEXT NOT NULL,
            attachments TEXT,
            created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        ''')
        conn.commit()

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()
