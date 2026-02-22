const COLUMNS = [
    { id: 'To Do', name: 'Open / Ready' },
    { id: 'Review/Spec', name: 'Review / Spec' },
    { id: 'CCB', name: 'CCB' },
    { id: 'Dev/Verify', name: 'Dev / Verify' },
    { id: 'Review', name: 'Final Review / Done' }
];

let tickets = [];
let filteredTickets = [];
let selectedTicket = null;
let currentView = 'kanban'; // 'kanban' or 'explorer'

async function fetchTickets() {
    try {
        const response = await fetch('/api/tickets');
        tickets = await response.json();
        applyFilters();
    } catch (err) {
        console.error('Failed to fetch tickets:', err);
    }
}

function applyFilters() {
    const projectFilter = document.getElementById('projectInput').value.toLowerCase();
    const userFilter = document.getElementById('userInput').value.toLowerCase();
    const searchTerm = document.getElementById('projectInput').value.toLowerCase(); // Using project input as general search for now or add new bar
    const startDate = document.getElementById('startDateInput').value;
    const endDate = document.getElementById('endDateInput').value;

    filteredTickets = tickets.filter(t => {
        const matchesProject = !projectFilter || t.project_id.toLowerCase().includes(projectFilter);
        const matchesUser = !userFilter || (t.assignee && t.assignee.toLowerCase().includes(userFilter));

        // General search in metadata
        const metadataString = `${t.id} ${t.title} ${t.alias || ''} ${t.tags || ''} ${t.keywords || ''}`.toLowerCase();
        const matchesSearch = !projectFilter || metadataString.includes(projectFilter); // Reusing project filter as search term if it's broad

        let matchesDate = true;
        if (startDate || endDate) {
            const ticketDate = new Date(t.created_at);
            if (startDate && ticketDate < new Date(startDate)) matchesDate = false;
            if (endDate && ticketDate > new Date(endDate)) matchesDate = false;
        }

        return matchesProject && matchesUser && matchesDate && matchesSearch;
    });

    renderCurrentView();
}

function renderCurrentView() {
    if (currentView === 'kanban') {
        renderBoard();
    } else {
        renderExplorer();
    }
}

function switchView(view) {
    currentView = view;
    document.getElementById('board').style.display = view === 'kanban' ? 'flex' : 'none';
    document.getElementById('explorer').style.display = view === 'explorer' ? 'block' : 'none';

    document.getElementById('showKanbanBtn').classList.toggle('active', view === 'kanban');
    document.getElementById('showExplorerBtn').classList.toggle('active', view === 'explorer');

    renderCurrentView();
}

async function queryJira(isDeployment = false) {
    const payload = {
        project: document.getElementById('projectInput').value || 'VPC',
        user: document.getElementById('userInput').value || null,
        start_date: document.getElementById('startDateInput').value ? new Date(document.getElementById('startDateInput').value).toISOString() : null,
        end_date: document.getElementById('endDateInput').value ? new Date(document.getElementById('endDateInput').value).toISOString() : null,
        query_string: isDeployment ? 'DEPLOYMENT_QUERY' : null
    };

    try {
        const response = await fetch('/api/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        await response.json();
        fetchTickets();
    } catch (err) {
        console.error('Query failed:', err);
    }
}

function renderBoard() {
    const board = document.getElementById('board');
    board.innerHTML = '';

    COLUMNS.forEach(col => {
        const colEl = document.createElement('div');
        colEl.className = 'column';
        colEl.dataset.status = col.id;

        // Drag over column handlers
        colEl.ondragover = (e) => {
            e.preventDefault();
            colEl.classList.add('drag-over');
        };
        colEl.ondragleave = () => colEl.classList.remove('drag-over');
        colEl.ondrop = async (e) => {
            e.preventDefault();
            colEl.classList.remove('drag-over');
            const ticketId = e.dataTransfer.getData('text/plain');
            if (ticketId) {
                await moveNext(ticketId, col.id);
            }
        };

        const colTickets = filteredTickets.filter(t => t.status === col.id);

        colEl.innerHTML = `
            <div class="column-header">
                <span>${col.name}</span>
                <span class="ticket-count">${colTickets.length}</span>
            </div>
            <div class="ticket-list" data-status="${col.id}"></div>
        `;

        const list = colEl.querySelector('.ticket-list');
        colTickets.forEach(ticket => {
            const card = document.createElement('div');
            card.className = `ticket-card glass ${ticket.is_deleted ? 'deleted-ticket' : ''}`;
            card.draggable = !ticket.is_deleted;
            card.innerHTML = `
                <div class="ticket-header" style="display:flex; justify-content:space-between;">
                    <div class="ticket-id">${ticket.id}</div>
                    ${ticket.is_deleted ? '<span class="status-badge deleted">DELETED</span>' : ''}
                </div>
                <div class="ticket-title">${ticket.alias ? `<span class="alias">@${ticket.alias}</span> ` : ''}${ticket.title}</div>
                <div class="ticket-footer">
                    <span class="type-tag">${ticket.ticket_type}</span>
                    <span class="assignee">${ticket.assignee || 'Unassigned'}</span>
                </div>
            `;

            // Drag card handlers
            if (!ticket.is_deleted) {
                card.ondragstart = (e) => {
                    e.dataTransfer.setData('text/plain', ticket.id);
                    setTimeout(() => card.style.opacity = '0.5', 0);
                };
                card.ondragend = () => card.style.opacity = '1';
            }

            card.onclick = () => openTicketDetail(ticket);
            list.appendChild(card);
        });

        board.appendChild(colEl);
    });
}

function renderExplorer() {
    const body = document.getElementById('ticketTableBody');
    body.innerHTML = '';

    filteredTickets.forEach(ticket => {
        const tr = document.createElement('tr');
        tr.className = ticket.is_deleted ? 'deleted-row' : '';
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
            <td><span style="color:var(--accent-blue)">${ticket.id}</span></td>
            <td>
                ${ticket.is_deleted ? '<span class="status-badge deleted">DELETED</span> ' : ''}
                ${ticket.alias ? `<span class="alias">@${ticket.alias}</span> ` : ''}
                ${ticket.title}
            </td>
            <td><span class="type-tag" style="background:rgba(88,166,255,0.1); color:var(--accent-blue)">${ticket.status}</span></td>
            <td>${ticket.assignee || 'Unassigned'}</td>
            <td>${ticket.project_id}</td>
            <td>${ticket.ticket_type}</td>
            <td style="color:var(--text-secondary)">${new Date(ticket.created_at).toLocaleDateString()}</td>
        `;
        tr.onclick = () => openTicketDetail(ticket);
        body.appendChild(tr);
    });
}

async function openTicketDetail(ticket) {
    selectedTicket = ticket;
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');

    modal.style.display = 'flex';
    content.innerHTML = `<p>Loading details...</p>`;

    // Fetch comments
    const resp = await fetch(`/api/tickets/${ticket.id}/comments`);
    const comments = await resp.json();

    content.innerHTML = `
        <div class="modal-header">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h2 class="ticket-id">${ticket.id}</h2>
                ${ticket.jira_url ? `<a href="${ticket.jira_url}" target="_blank" class="jira-link">View in JIRA ↗</a>` : ''}
            </div>
            <h1>${ticket.title}</h1>
            ${ticket.is_deleted ? '<div class="status-badge deleted" style="display:inline-block; margin-top:5px;">THS TICKET WAS DELETED IN JIRA</div>' : ''}
        </div>
        <div class="ticket-desc">
            <p>${ticket.description || 'No description provided.'}</p>
        </div>
        
        <div class="metadata-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1.5rem;">
            <div>
                <label>Alias (Nickname)</label>
                <input type="text" id="metaAlias" value="${ticket.alias || ''}" placeholder="e.g. Core System Refactor">
            </div>
            <div>
                <label>Tags (comma separated)</label>
                <input type="text" id="metaTags" value="${ticket.tags || ''}" placeholder="e.g. api, bug, high-pri">
            </div>
            <div>
                <label>Keywords</label>
                <input type="text" id="metaKeywords" value="${ticket.keywords || ''}" placeholder="Internal keywords">
            </div>
            <div>
                <label>Related Tickets</label>
                <input type="text" id="metaRelated" value="${ticket.related_tickets || ''}" placeholder="IDs separated by comma">
            </div>
        </div>
        <button onclick="updateMetadata('${ticket.id}')" style="margin-top:0.5rem;">Save Local Metadata</button>

        <div style="margin-top: 1.5rem;">
            <h3>Assignee</h3>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                <input type="text" id="newAssignee" value="${ticket.assignee || ''}" placeholder="Team Member Name">
                <button onclick="updateAssignee('${ticket.id}')">Update</button>
            </div>
        </div>

        <div class="comment-section">
            <h3 style="margin-top: 2rem;">Timeline & Comments</h3>
            <div class="comment-list">
                ${comments.map(c => `
                    <div class="comment">
                        <div class="comment-header">
                            <span>${c.author}</span>
                            <span>${new Date(c.created_at).toLocaleString()}</span>
                        </div>
                        <p>${c.content}</p>
                        ${c.attachments ? `<div style="margin-top:0.5rem; font-size:0.8rem;"><a href="${c.attachments}" target="_blank" style="color:var(--accent-blue);">📎 Attachment/Link</a></div>` : ''}
                    </div>
                `).join('')}
            </div>
            <div style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem;">
                <textarea id="commentInput" placeholder="Add a comment or link (MR, Test cases)..." style="width: 100%; min-height: 80px; background: #161b22; color: white; border: 1px solid var(--border-color); padding: 0.5rem; border-radius: 6px;"></textarea>
                <input type="text" id="attachmentInput" placeholder="Attachment URL / Link">
                <button onclick="addComment('${ticket.id}')">Post Comment</button>
            </div>
        </div>
    `;

    // Logic for "Next Process"
    const nextBtn = document.getElementById('moveNextBtn');
    const currentIndex = COLUMNS.findIndex(c => c.id === ticket.status);
    if (currentIndex >= 0 && currentIndex < COLUMNS.length - 1 && !ticket.is_deleted) {
        nextBtn.style.display = 'block';
        nextBtn.innerText = `Move to ${COLUMNS[currentIndex + 1].name}`;
        nextBtn.onclick = () => moveNext(ticket.id, COLUMNS[currentIndex + 1].id);
    } else {
        nextBtn.style.display = 'none';
    }
}

async function updateMetadata(id) {
    const payload = {
        alias: document.getElementById('metaAlias').value,
        tags: document.getElementById('metaTags').value,
        keywords: document.getElementById('metaKeywords').value,
        related_tickets: document.getElementById('metaRelated').value
    };

    await fetch(`/api/tickets/${id}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    fetchTickets();
    closeModal();
}

async function updateAssignee(id) {
    const assignee = document.getElementById('newAssignee').value;
    await fetch(`/api/tickets/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignee)
    });
    fetchTickets();
    closeModal();
}

async function addComment(id) {
    const content = document.getElementById('commentInput').value;
    const attachments = document.getElementById('attachmentInput').value;
    if (!content) return;

    await fetch(`/api/tickets/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: "Current User", content, attachments })
    });

    // Refresh modal
    const ticket = tickets.find(t => t.id === id);
    openTicketDetail(ticket);
    fetchTickets();
}

async function moveNext(id, nextStatus) {
    await fetch(`/api/tickets/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextStatus)
    });
    fetchTickets();
    closeModal();
}

function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    selectedTicket = null;
}

// Initial Setup
document.getElementById('refreshBtn').onclick = () => queryJira(false);
document.getElementById('queryDeploymentBtn').onclick = () => queryJira(true);

document.getElementById('showKanbanBtn').onclick = () => switchView('kanban');
document.getElementById('showExplorerBtn').onclick = () => switchView('explorer');

// Filtering listeners
['projectInput', 'userInput', 'startDateInput', 'endDateInput'].forEach(id => {
    document.getElementById(id).oninput = applyFilters;
});

// Close modal on click outside
window.onclick = (event) => {
    const modal = document.getElementById('modalOverlay');
    if (event.target == modal) {
        closeModal();
    }
};

fetchTickets();
setInterval(fetchTickets, 60000); // Auto refresh every 60s
