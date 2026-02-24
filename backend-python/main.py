import os
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from datetime import datetime

import db
from db import get_db
from models import (
    JiraQuery, JiraTicket, Task, TaskComment,
    CreateTaskRequest, UpdateTaskRequest, AddToKanbanRequest, UpdateStatusRequest
)
from jira_client import JiraClient

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Start logic
@app.on_event("startup")
def startup_event():
    db.init_db()

jira = JiraClient()

# ─── Backlog ─────────────────────────────────────────────────────────────────

@app.post("/api/backlog/query", response_model=List[JiraTicket])
def query_backlog(query: JiraQuery):
    return jira.query_tickets(query)


# ─── Tasks ───────────────────────────────────────────────────────────────────

@app.get("/api/tasks", response_model=List[Task])
def list_tasks():
    with get_db() as conn:
        users = conn.execute("SELECT * FROM tasks ORDER BY parent_task_id NULLS FIRST, id ASC").fetchall()
        return [dict(u) for u in users]

@app.post("/api/tasks", response_model=Task)
def create_task(req: CreateTaskRequest):
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO tasks (jira_ticket_key, title, description, status, assignee, project_key,
                                parent_task_id, alias, start_date, due_date, jira_url)
            VALUES (?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?, ?)
        """, (
            req.jira_ticket_key, req.title, req.description, req.assignee, req.project_key,
            req.parent_task_id, req.alias, req.start_date, req.due_date, req.jira_url
        ))
        conn.commit()
        task_id = cur.lastrowid
        task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return dict(task)

@app.post("/api/tasks/from-backlog", response_model=List[Task])
def add_tasks_from_backlog(req: AddToKanbanRequest):
    all_tickets = jira.query_tickets(JiraQuery())
    
    ticket_map = {}
    def flatten(tickets):
        for t in tickets:
            sub = t.subtasks
            t.subtasks = []
            ticket_map[t.key] = t
            flatten(sub)
            
    flatten(all_tickets)
    
    created_tasks = []
    
    with get_db() as conn:
        for key in req.ticket_keys:
            if key not in ticket_map:
                continue
            
            ticket = ticket_map[key]
            existing = conn.execute("SELECT * FROM tasks WHERE jira_ticket_key = ?", (ticket.key,)).fetchone()
            
            if existing:
                parent_id = existing['id']
            else:
                cur = conn.cursor()
                cur.execute("""
                    INSERT INTO tasks (jira_ticket_key, title, description, status, assignee,
                                       project_key, start_date, due_date, jira_url)
                    VALUES (?, ?, ?, 'Pending', ?, ?, ?, ?, ?)
                """, (ticket.key, ticket.title, ticket.description, ticket.assignee, ticket.project_key,
                      ticket.start_date, ticket.due_date, ticket.jira_url))
                conn.commit()
                parent_id = cur.lastrowid
                created = conn.execute("SELECT * FROM tasks WHERE id = ?", (parent_id,)).fetchone()
                created_tasks.append(dict(created))
                
            if req.include_subtasks:
                subtask_keys = [t.key for t in ticket_map.values() if t.parent_key == key]
                for sub_key in subtask_keys:
                    sub_ticket = ticket_map[sub_key]
                    already = conn.execute("SELECT * FROM tasks WHERE jira_ticket_key = ?", (sub_ticket.key,)).fetchone()
                    if not already:
                        cur = conn.cursor()
                        cur.execute("""
                            INSERT INTO tasks (jira_ticket_key, title, description, status,
                                               assignee, project_key, parent_task_id,
                                               start_date, due_date, jira_url)
                            VALUES (?, ?, ?, 'Pending', ?, ?, ?, ?, ?, ?)
                        """, (sub_ticket.key, sub_ticket.title, sub_ticket.description, sub_ticket.assignee,
                              sub_ticket.project_key, parent_id, sub_ticket.start_date, sub_ticket.due_date, sub_ticket.jira_url))
                        conn.commit()
                        created = conn.execute("SELECT * FROM tasks WHERE id = ?", (cur.lastrowid,)).fetchone()
                        created_tasks.append(dict(created))

    return created_tasks

@app.put("/api/tasks/{task_id}")
def update_task(task_id: int, req: UpdateTaskRequest):
    with get_db() as conn:
        conn.execute("""
            UPDATE tasks SET
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
            WHERE id = ?
        """, (
            req.title, req.description, req.status, req.stage, req.assignee, req.alias,
            req.tags, req.keywords, req.start_date, req.due_date, datetime.utcnow(), task_id
        ))
        conn.commit()
        return True

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()
        return True

@app.post("/api/tasks/{task_id}/status")
def update_task_status(task_id: int, req: UpdateStatusRequest):
    stage_val = req.stage if req.status not in ("Done", "Pending") else None
    with get_db() as conn:
        conn.execute("UPDATE tasks SET status = ?, stage = ?, updated_at = ? WHERE id = ?", 
                     (req.status, stage_val, datetime.utcnow(), task_id))
        conn.commit()
        return True


# ─── Task Comments ────────────────────────────────────────────────────────────

@app.get("/api/tasks/{task_id}/comments", response_model=List[TaskComment])
def list_task_comments(task_id: int):
    with get_db() as conn:
        comments = conn.execute("SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC", (task_id,)).fetchall()
        return [dict(c) for c in comments]

@app.post("/api/tasks/{task_id}/comments")
async def add_task_comment(task_id: int, request: Request):
    payload = await request.json()
    author = payload.get("author", "익명")
    content = payload.get("content", "")
    attachments = payload.get("attachments")
    
    with get_db() as conn:
        conn.execute("""
            INSERT INTO task_comments (task_id, author, content, attachments)
            VALUES (?, ?, ?, ?)
        """, (task_id, author, content, attachments))
        conn.commit()
        return True


# ─── Frontend Serving ─────────────────────────────────────────────────────────

frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(frontend_path, "index.html"))

@app.get("/app.js")
def serve_app_js():
    return FileResponse(os.path.join(frontend_path, "app.js"))

@app.get("/style.css")
def serve_style_css():
    return FileResponse(os.path.join(frontend_path, "style.css"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=True)
