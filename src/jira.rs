use crate::models::{JiraTicket, JiraQuery};
use chrono::{Utc, NaiveDate};

pub struct JiraClient {
    // 실제 구현 시: base_url, api_token, user_email 등 보유
}

impl JiraClient {
    pub fn new() -> Self {
        Self {}
    }

    pub async fn query_tickets(&self, query: JiraQuery) -> Vec<JiraTicket> {
        let project = query.project.clone().unwrap_or_else(|| "VPC".to_string());
        let mut tickets = Vec::new();

        // ── 부모 티켓 3개 생성 (각각에 subtask 포함) ──
        for i in 1..=3 {
            let parent_key = format!("{}-{}", project, 100 + i);
            let subtasks: Vec<JiraTicket> = (1..=2)
                .map(|j| JiraTicket {
                    key: format!("{}-{}", project, 200 + (i - 1) * 2 + j),
                    title: format!("Sub-task {} of Story {}", j, i),
                    description: Some(format!("구현 세부 항목 {} (Story {} 하위)", j, i)),
                    jira_status: "To Do".to_string(),
                    assignee: query.user.clone(),
                    project_key: project.clone(),
                    ticket_type: "Sub-task".to_string(),
                    parent_key: Some(parent_key.clone()),
                    subtasks: vec![],
                    start_date: None,
                    due_date: Some(
                        NaiveDate::from_ymd_opt(2026, 3, 10 + i as u32 * 5).unwrap()
                    ),
                    created_at: Utc::now(),
                    jira_url: Some(format!(
                        "https://jira.example.com/browse/{}-{}",
                        project,
                        200 + (i - 1) * 2 + j
                    )),
                })
                .collect();

            tickets.push(JiraTicket {
                key: parent_key.clone(),
                title: format!("Story {}: 주요 기능 개발 {}", i, i),
                description: Some(format!(
                    "이 스토리는 주요 기능 {}를 구현합니다. 하위에 {} 개의 세부 태스크가 있습니다.",
                    i,
                    subtasks.len()
                )),
                jira_status: if i == 1 { "In Progress".to_string() } else { "To Do".to_string() },
                assignee: query.user.clone(),
                project_key: project.clone(),
                ticket_type: "Story".to_string(),
                parent_key: None,
                subtasks,
                start_date: Some(NaiveDate::from_ymd_opt(2026, 2, 20).unwrap()),
                due_date: Some(NaiveDate::from_ymd_opt(2026, 3, 15 + i as u32 * 5).unwrap()),
                created_at: Utc::now(),
                jira_url: Some(format!("https://jira.example.com/browse/{}", parent_key)),
            });
        }

        // ── 단독 티켓 (subtask 없음) ──
        for i in 1..=2 {
            let key = format!("{}-{}", project, 300 + i);
            tickets.push(JiraTicket {
                key: key.clone(),
                title: format!("Bug Fix {}: 긴급 버그 수정", i),
                description: Some(format!("긴급 버그 {} 수정 작업", i)),
                jira_status: "To Do".to_string(),
                assignee: None,
                project_key: project.clone(),
                ticket_type: "Bug".to_string(),
                parent_key: None,
                subtasks: vec![],
                start_date: None,
                due_date: Some(NaiveDate::from_ymd_opt(2026, 3, 1 + i as u32).unwrap()),
                created_at: Utc::now(),
                jira_url: Some(format!("https://jira.example.com/browse/{}", key)),
            });
        }

        tickets
    }
}
