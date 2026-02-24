package models

import "time"

// JiraTicket represents a ticket from Jira (not saved to DB)
type JiraTicket struct {
	Key         string       `json:"key"`
	Title       string       `json:"title"`
	Description *string      `json:"description"`
	JiraStatus  string       `json:"jira_status"`
	Assignee    *string      `json:"assignee"`
	ProjectKey  string       `json:"project_key"`
	TicketType  string       `json:"ticket_type"`
	ParentKey   *string      `json:"parent_key"`
	Subtasks    []JiraTicket `json:"subtasks"`
	StartDate   *string      `json:"start_date"` // YYYY-MM-DD
	DueDate     *string      `json:"due_date"`   // YYYY-MM-DD
	CreatedAt   time.Time    `json:"created_at"`
	JiraURL     *string      `json:"jira_url"`
}

// Task represents a task in the kanban board (saved to DB)
type Task struct {
	ID            int64     `json:"id" db:"id"`
	JiraTicketKey *string   `json:"jira_ticket_key" db:"jira_ticket_key"`
	Title         string    `json:"title" db:"title"`
	Description   *string   `json:"description" db:"description"`
	Status        string    `json:"status" db:"status"` // "Pending" | "InProgress" | "Done"
	Stage         *string   `json:"stage" db:"stage"`
	Assignee      *string   `json:"assignee" db:"assignee"`
	ProjectKey    *string   `json:"project_key" db:"project_key"`
	ParentTaskID  *int64    `json:"parent_task_id" db:"parent_task_id"`
	Alias         *string   `json:"alias" db:"alias"`
	Tags          *string   `json:"tags" db:"tags"`
	Keywords      *string   `json:"keywords" db:"keywords"`
	StartDate     *string   `json:"start_date" db:"start_date"` // YYYY-MM-DD
	DueDate       *string   `json:"due_date" db:"due_date"`     // YYYY-MM-DD
	JiraURL       *string   `json:"jira_url" db:"jira_url"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
}

// TaskComment represents a comment on a task
type TaskComment struct {
	ID          int64     `json:"id" db:"id"`
	TaskID      int64     `json:"task_id" db:"task_id"`
	Author      string    `json:"author" db:"author"`
	Content     string    `json:"content" db:"content"`
	Attachments *string   `json:"attachments" db:"attachments"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
}

// DTOs

type JiraQuery struct {
	Project     *string    `json:"project"`
	User        *string    `json:"user"`
	StartDate   *time.Time `json:"start_date"`
	EndDate     *time.Time `json:"end_date"`
	QueryString *string    `json:"query_string"` // raw JQL
}

type AddToKanbanRequest struct {
	TicketKeys      []string `json:"ticket_keys"`
	IncludeSubtasks bool     `json:"include_subtasks"`
}

type CreateTaskRequest struct {
	Title         string  `json:"title"`
	Description   *string `json:"description"`
	JiraTicketKey *string `json:"jira_ticket_key"`
	Assignee      *string `json:"assignee"`
	ProjectKey    *string `json:"project_key"`
	ParentTaskID  *int64  `json:"parent_task_id"`
	Alias         *string `json:"alias"`
	StartDate     *string `json:"start_date"` // YYYY-MM-DD
	DueDate       *string `json:"due_date"`   // YYYY-MM-DD
	JiraURL       *string `json:"jira_url"`
}

type UpdateTaskRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Status      *string `json:"status"`
	Stage       *string `json:"stage"`
	Assignee    *string `json:"assignee"`
	Alias       *string `json:"alias"`
	Tags        *string `json:"tags"`
	Keywords    *string `json:"keywords"`
	StartDate   *string `json:"start_date"`
	DueDate     *string `json:"due_date"`
}

type UpdateStatusRequest struct {
	Status string  `json:"status"`
	Stage  *string `json:"stage"`
}
