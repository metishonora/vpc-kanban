use crate::models::{Ticket, JiraQuery};
use chrono::{Utc, TimeZone};
use uuid::Uuid;

pub struct JiraClient {
    // In a real implementation, this would hold API tokens, base URL, etc.
}

impl JiraClient {
    pub fn new() -> Self {
        Self {}
    }

    pub async fn query_tickets(&self, query: JiraQuery) -> Vec<Ticket> {
        // Mock implementation for different versions/scenarios
        let mut tickets = Vec::new();
        
        // Random mock data generation
        for i in 1..=5 {
            let id = format!("{}-{}", query.project.clone().unwrap_or("PROJ".to_string()), 100 + i);
            tickets.push(Ticket {
                id: id.clone(),
                title: format!("Ticket Title {}", i),
                description: Some("This is a mock description from JIRA".to_string()),
                status: "To Do".to_string(),
                assignee: query.user.clone(),
                project_id: query.project.clone().unwrap_or("DEFAULT".to_string()),
                created_at: Utc::now(),
                updated_at: Utc::now(),
                ticket_type: "Task".to_string(),
                parent_id: None,
                start_date: None,
                end_date: None,
                jira_url: Some(format!("https://jira.company.com/browse/{}", id)),
                alias: None,
                tags: None,
                keywords: None,
                related_tickets: None,
                is_deleted: false,
            });
        }

        // Add a mock deployment ticket if specifically requested or to demonstrate
        if query.query_string.as_deref() == Some("DEPLOYMENT_QUERY") {
            let dep_id = "DEP-123".to_string();
            tickets.push(Ticket {
                id: dep_id.clone(),
                title: "Release v1.0.0".to_string(),
                description: Some("Deployment ticket for version 1.0.0".to_string()),
                status: "In Progress".to_string(),
                assignee: Some("Lead".to_string()),
                project_id: "DEPLOY".to_string(),
                created_at: Utc::now(),
                updated_at: Utc::now(),
                ticket_type: "Deployment".to_string(),
                parent_id: None,
                start_date: Some(Utc::now()),
                end_date: Some(Utc::now() + chrono::Duration::days(14)),
                jira_url: Some(format!("https://jira.company.com/browse/{}", dep_id)),
                alias: Some("v1.0.0 Release".to_string()),
                tags: Some("release,major".to_string()),
                keywords: Some("production,stable".to_string()),
                related_tickets: None,
                is_deleted: false,
            });

            // Add sub-tasks for the deployment
            for i in 1..=3 {
                let sub_id = format!("SUB-{}", i);
                tickets.push(Ticket {
                    id: sub_id.clone(),
                    title: format!("Sub-task Implementation {}", i),
                    description: None,
                    status: "Review/Spec".to_string(),
                    assignee: None,
                    project_id: "DEPLOY".to_string(),
                    created_at: Utc::now(),
                    updated_at: Utc::now(),
                    ticket_type: "Task".to_string(),
                    parent_id: Some(dep_id.clone()),
                    start_date: None,
                    end_date: None,
                    jira_url: Some(format!("https://jira.company.com/browse/{}", sub_id)),
                    alias: None,
                    tags: None,
                    keywords: None,
                    related_tickets: Some(dep_id.clone()),
                    is_deleted: false,
                });
            }
        }

        tickets
    }
}
