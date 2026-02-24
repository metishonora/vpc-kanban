package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"vpc-kanban-go/db"
	"vpc-kanban-go/jira"
	"vpc-kanban-go/models"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
)

type AppState struct {
	DB   *sqlx.DB
	Jira *jira.JiraClient
}

func main() {
	database, err := db.InitDB()
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	state := &AppState{
		DB:   database,
		Jira: jira.NewJiraClient(),
	}

	r := gin.Default()

	// CORS Setup
	r.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"},
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	api := r.Group("/api")
	{
		// Backlog
		api.POST("/backlog/query", func(c *gin.Context) {
			var query models.JiraQuery
			if err := c.ShouldBindJSON(&query); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			tickets := state.Jira.QueryTickets(query)
			c.JSON(http.StatusOK, tickets)
		})

		// Tasks
		tasks := api.Group("/tasks")
		{
			tasks.GET("", func(c *gin.Context) {
				var taskList []models.Task
				err := state.DB.Select(&taskList, "SELECT * FROM tasks ORDER BY parent_task_id NULLS FIRST, id ASC")
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				if taskList == nil {
					taskList = []models.Task{}
				}
				c.JSON(http.StatusOK, taskList)
			})

			tasks.POST("", func(c *gin.Context) {
				var req models.CreateTaskRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}

				res, err := state.DB.NamedExec(`
					INSERT INTO tasks (jira_ticket_key, title, description, status, assignee, project_key, parent_task_id, alias, start_date, due_date, jira_url)
					VALUES (:jira_ticket_key, :title, :description, 'Pending', :assignee, :project_key, :parent_task_id, :alias, :start_date, :due_date, :jira_url)
				`, req)

				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}

				id, _ := res.LastInsertId()
				var task models.Task
				err = state.DB.Get(&task, "SELECT * FROM tasks WHERE id = ?", id)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}

				c.JSON(http.StatusOK, task)
			})

			tasks.POST("/from-backlog", func(c *gin.Context) {
				var req models.AddToKanbanRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}

				allTickets := state.Jira.QueryTickets(models.JiraQuery{})
				ticketMap := make(map[string]models.JiraTicket)

				var flatten func([]models.JiraTicket)
				flatten = func(tickets []models.JiraTicket) {
					for _, t := range tickets {
						sub := t.Subtasks
						t.Subtasks = nil
						ticketMap[t.Key] = t
						flatten(sub)
					}
				}
				flatten(allTickets)

				var createdTasks []models.Task

				for _, key := range req.TicketKeys {
					ticket, exists := ticketMap[key]
					if !exists {
						continue
					}

					var existing models.Task
					err := state.DB.Get(&existing, "SELECT * FROM tasks WHERE jira_ticket_key = ?", ticket.Key)

					var parentID int64
					if err == sql.ErrNoRows {
						res, err := state.DB.NamedExec(`
							INSERT INTO tasks (jira_ticket_key, title, description, status, assignee, project_key, start_date, due_date, jira_url)
							VALUES (:key, :title, :description, 'Pending', :assignee, :project_key, :start_date, :due_date, :jira_url)
						`, ticket)
						if err != nil {
							continue
						}
						parentID, _ = res.LastInsertId()

						var t models.Task
						if err := state.DB.Get(&t, "SELECT * FROM tasks WHERE id = ?", parentID); err == nil {
							createdTasks = append(createdTasks, t)
						}
					} else if err == nil {
						parentID = existing.ID
					}

					if req.IncludeSubtasks {
						var subtaskKeys []string
						for _, t := range ticketMap {
							if t.ParentKey != nil && *t.ParentKey == key {
								subtaskKeys = append(subtaskKeys, t.Key)
							}
						}

						for _, subKey := range subtaskKeys {
							subTicket := ticketMap[subKey]
							var already models.Task
							if err := state.DB.Get(&already, "SELECT * FROM tasks WHERE jira_ticket_key = ?", subTicket.Key); err == sql.ErrNoRows {
								
								params := map[string]interface{}{
									"key":            subTicket.Key,
									"title":          subTicket.Title,
									"description":    subTicket.Description,
									"assignee":       subTicket.Assignee,
									"project_key":    subTicket.ProjectKey,
									"parent_task_id": parentID,
									"start_date":     subTicket.StartDate,
									"due_date":       subTicket.DueDate,
									"jira_url":       subTicket.JiraURL,
								}

								res, err := state.DB.NamedExec(`
									INSERT INTO tasks (jira_ticket_key, title, description, status, assignee, project_key, parent_task_id, start_date, due_date, jira_url)
									VALUES (:key, :title, :description, 'Pending', :assignee, :project_key, :parent_task_id, :start_date, :due_date, :jira_url)
								`, params)

								if err == nil {
									subID, _ := res.LastInsertId()
									var t models.Task
									if err := state.DB.Get(&t, "SELECT * FROM tasks WHERE id = ?", subID); err == nil {
										createdTasks = append(createdTasks, t)
									}
								}
							}
						}
					}
				}

				if createdTasks == nil {
					createdTasks = []models.Task{}
				}
				c.JSON(http.StatusOK, createdTasks)
			})

			tasks.PUT("/:id", func(c *gin.Context) {
				id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
				var req models.UpdateTaskRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}

				_, err := state.DB.Exec(`
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
				`, req.Title, req.Description, req.Status, req.Stage, req.Assignee, req.Alias, req.Tags, req.Keywords, req.StartDate, req.DueDate, time.Now(), id)

				c.JSON(http.StatusOK, err == nil)
			})

			tasks.DELETE("/:id", func(c *gin.Context) {
				id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
				_, err := state.DB.Exec("DELETE FROM tasks WHERE id = ?", id)
				c.JSON(http.StatusOK, err == nil)
			})

			tasks.POST("/:id/status", func(c *gin.Context) {
				id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
				var req models.UpdateStatusRequest
				if err := c.ShouldBindJSON(&req); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}

				var stage *string
				if req.Status != "Done" && req.Status != "Pending" {
					stage = req.Stage
				}

				_, err := state.DB.Exec("UPDATE tasks SET status = ?, stage = ?, updated_at = ? WHERE id = ?", req.Status, stage, time.Now(), id)
				c.JSON(http.StatusOK, err == nil)
			})

			tasks.GET("/:id/comments", func(c *gin.Context) {
				id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
				var comments []models.TaskComment
				err := state.DB.Select(&comments, "SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC", id)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
					return
				}
				if comments == nil {
					comments = []models.TaskComment{}
				}
				c.JSON(http.StatusOK, comments)
			})

			tasks.POST("/:id/comments", func(c *gin.Context) {
				id, _ := strconv.ParseInt(c.Param("id"), 10, 64)

				var payload map[string]interface{}
				if err := c.ShouldBindJSON(&payload); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
					return
				}

				author := "익명"
				if a, ok := payload["author"].(string); ok && a != "" {
					author = a
				}

				content := ""
				if a, ok := payload["content"].(string); ok {
					content = a
				}

				var attachments *string
				if a, ok := payload["attachments"].(string); ok {
					attachments = &a
				}

				_, err := state.DB.Exec(`
					INSERT INTO task_comments (task_id, author, content, attachments)
					VALUES (?, ?, ?, ?)
				`, id, author, content, attachments)

				c.JSON(http.StatusOK, err == nil)
			})
		}
	}

	// Serve frontend static files specifically to avoid routing conflicts
	r.GET("/", func(c *gin.Context) {
		c.File("../frontend/index.html")
	})
	r.GET("/app.js", func(c *gin.Context) {
		c.File("../frontend/app.js")
	})
	r.GET("/style.css", func(c *gin.Context) {
		c.File("../frontend/style.css")
	})

	fmt.Println("Listening on http://127.0.0.1:3000")
	if err := r.Run("0.0.0.0:3000"); err != nil {
		log.Fatalf("Failed to run server: %v", err)
	}
}
