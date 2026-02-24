from models import JiraQuery, JiraTicket
from datetime import datetime
from typing import List

class JiraClient:
    def query_tickets(self, query: JiraQuery) -> List[JiraTicket]:
        project = query.project if query.project else "VPC"
        tickets = []
        
        # ── 부모 티켓 3개 생성 (각각에 subtask 포함) ──
        for i in range(1, 4):
            parent_key = f"{project}-{100 + i}"
            subtasks = []
            
            for j in range(1, 3):
                key = f"{project}-{200 + (i - 1) * 2 + j}"
                due_date = f"2026-03-{10 + i * 5:02d}"
                subtasks.append(JiraTicket(
                    key=key,
                    title=f"Sub-task {j} of Story {i}",
                    description=f"구현 세부 항목 {j} (Story {i} 하위)",
                    jira_status="To Do",
                    assignee=query.user,
                    project_key=project,
                    ticket_type="Sub-task",
                    parent_key=parent_key,
                    subtasks=[],
                    start_date=None,
                    due_date=due_date,
                    created_at=datetime.utcnow(),
                    jira_url=f"https://jira.example.com/browse/{key}"
                ))
            
            status = "In Progress" if i == 1 else "To Do"
            due_date = f"2026-03-{15 + i * 5:02d}"
            
            tickets.append(JiraTicket(
                key=parent_key,
                title=f"Story {i}: 주요 기능 개발 {i}",
                description=f"이 스토리는 주요 기능 {i}를 구현합니다. 하위에 {len(subtasks)} 개의 세부 태스크가 있습니다.",
                jira_status=status,
                assignee=query.user,
                project_key=project,
                ticket_type="Story",
                parent_key=None,
                subtasks=subtasks,
                start_date="2026-02-20",
                due_date=due_date,
                created_at=datetime.utcnow(),
                jira_url=f"https://jira.example.com/browse/{parent_key}"
            ))
            
        # ── 단독 티켓 (subtask 없음) ──
        for i in range(1, 3):
            key = f"{project}-{300 + i}"
            due_date = f"2026-03-{1 + i:02d}"
            tickets.append(JiraTicket(
                key=key,
                title=f"Bug Fix {i}: 긴급 버그 수정",
                description=f"긴급 버그 {i} 수정 작업",
                jira_status="To Do",
                assignee=None,
                project_key=project,
                ticket_type="Bug",
                parent_key=None,
                subtasks=[],
                start_date=None,
                due_date=due_date,
                created_at=datetime.utcnow(),
                jira_url=f"https://jira.example.com/browse/{key}"
            ))
            
        return tickets
