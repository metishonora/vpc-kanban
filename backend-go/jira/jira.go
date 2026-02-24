package jira

import (
	"fmt"
	"time"

	"vpc-kanban-go/models"
)

type JiraClient struct{}

func NewJiraClient() *JiraClient {
	return &JiraClient{}
}

func strPtr(s string) *string {
	return &s
}

func (c *JiraClient) QueryTickets(query models.JiraQuery) []models.JiraTicket {
	project := "VPC"
	if query.Project != nil && *query.Project != "" {
		project = *query.Project
	}

	var tickets []models.JiraTicket

	// ── 부모 티켓 3개 생성 (각각에 subtask 포함) ──
	for i := 1; i <= 3; i++ {
		parentKey := fmt.Sprintf("%s-%d", project, 100+i)
		var subtasks []models.JiraTicket

		for j := 1; j <= 2; j++ {
			dueDate := fmt.Sprintf("2026-03-%02d", 10+i*5)
			key := fmt.Sprintf("%s-%d", project, 200+(i-1)*2+j)
			subtasks = append(subtasks, models.JiraTicket{
				Key:         key,
				Title:       fmt.Sprintf("Sub-task %d of Story %d", j, i),
				Description: strPtr(fmt.Sprintf("구현 세부 항목 %d (Story %d 하위)", j, i)),
				JiraStatus:  "To Do",
				Assignee:    query.User,
				ProjectKey:  project,
				TicketType:  "Sub-task",
				ParentKey:   &parentKey,
				Subtasks:    []models.JiraTicket{},
				StartDate:   nil,
				DueDate:     &dueDate,
				CreatedAt:   time.Now(),
				JiraURL:     strPtr(fmt.Sprintf("https://jira.example.com/browse/%s", key)),
			})
		}

		status := "To Do"
		if i == 1 {
			status = "In Progress"
		}

		dueDate := fmt.Sprintf("2026-03-%02d", 15+i*5)
		tickets = append(tickets, models.JiraTicket{
			Key:         parentKey,
			Title:       fmt.Sprintf("Story %d: 주요 기능 개발 %d", i, i),
			Description: strPtr(fmt.Sprintf("이 스토리는 주요 기능 %d를 구현합니다. 하위에 %d 개의 세부 태스크가 있습니다.", i, len(subtasks))),
			JiraStatus:  status,
			Assignee:    query.User,
			ProjectKey:  project,
			TicketType:  "Story",
			ParentKey:   nil,
			Subtasks:    subtasks,
			StartDate:   strPtr("2026-02-20"),
			DueDate:     &dueDate,
			CreatedAt:   time.Now(),
			JiraURL:     strPtr(fmt.Sprintf("https://jira.example.com/browse/%s", parentKey)),
		})
	}

	// ── 단독 티켓 (subtask 없음) ──
	for i := 1; i <= 2; i++ {
		key := fmt.Sprintf("%s-%d", project, 300+i)
		dueDate := fmt.Sprintf("2026-03-%02d", 1+i)
		tickets = append(tickets, models.JiraTicket{
			Key:         key,
			Title:       fmt.Sprintf("Bug Fix %d: 긴급 버그 수정", i),
			Description: strPtr(fmt.Sprintf("긴급 버그 %d 수정 작업", i)),
			JiraStatus:  "To Do",
			Assignee:    nil,
			ProjectKey:  project,
			TicketType:  "Bug",
			ParentKey:   nil,
			Subtasks:    []models.JiraTicket{},
			StartDate:   nil,
			DueDate:     &dueDate,
			CreatedAt:   time.Now(),
			JiraURL:     strPtr(fmt.Sprintf("https://jira.example.com/browse/%s", key)),
		})
	}

	return tickets
}
