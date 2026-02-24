from typing import Optional, List
from datetime import date, datetime
from pydantic import BaseModel, Field

# ─────────────────────────────────────────────
# Jira 티켓: 조회 전용, DB에 저장하지 않음
# ─────────────────────────────────────────────
class JiraTicket(BaseModel):
    key: str
    title: str
    description: Optional[str] = None
    jira_status: str
    assignee: Optional[str] = None
    project_key: str
    ticket_type: str
    parent_key: Optional[str] = None
    subtasks: List["JiraTicket"] = []
    start_date: Optional[str] = None    # YYYY-MM-DD string as NaiveDate isn't directly JSON serializable uniformly
    due_date: Optional[str] = None      # YYYY-MM-DD
    created_at: datetime
    jira_url: Optional[str] = None


# ─────────────────────────────────────────────
# Task: kanban에 추가된 일감. DB에 영구 저장.
# ─────────────────────────────────────────────
class Task(BaseModel):
    id: int
    jira_ticket_key: Optional[str] = None
    title: str
    description: Optional[str] = None
    status: str
    stage: Optional[str] = None
    assignee: Optional[str] = None
    project_key: Optional[str] = None
    parent_task_id: Optional[int] = None
    alias: Optional[str] = None
    tags: Optional[str] = None
    keywords: Optional[str] = None
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    jira_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ─────────────────────────────────────────────
# Task Comment
# ─────────────────────────────────────────────
class TaskComment(BaseModel):
    id: int
    task_id: int
    author: str
    content: str
    attachments: Optional[str] = None
    created_at: datetime


# ─────────────────────────────────────────────
# Request / Response DTOs
# ─────────────────────────────────────────────
class JiraQuery(BaseModel):
    project: Optional[str] = None
    user: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    query_string: Optional[str] = None


class AddToKanbanRequest(BaseModel):
    ticket_keys: List[str]
    include_subtasks: bool


class CreateTaskRequest(BaseModel):
    title: str
    description: Optional[str] = None
    jira_ticket_key: Optional[str] = None
    assignee: Optional[str] = None
    project_key: Optional[str] = None
    parent_task_id: Optional[int] = None
    alias: Optional[str] = None
    start_date: Optional[str] = None
    due_date: Optional[str] = None
    jira_url: Optional[str] = None


class UpdateTaskRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    stage: Optional[str] = None
    assignee: Optional[str] = None
    alias: Optional[str] = None
    tags: Optional[str] = None
    keywords: Optional[str] = None
    start_date: Optional[str] = None
    due_date: Optional[str] = None


class UpdateStatusRequest(BaseModel):
    status: str
    stage: Optional[str] = None
