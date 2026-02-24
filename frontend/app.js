// ═══════════════════════════════════════════════════════════════
// 상수 정의
// ═══════════════════════════════════════════════════════════════

const KANBAN_COLUMNS = [
    { id: 'Pending', label: '예정' },
    { id: 'InProgress', label: '진행중' },
    { id: 'Done', label: '완료' },
];

// InProgress 세부 단계 (순서대로)
const STAGES = ['사양확인', 'CCB', '개발', '검증', '리뷰'];

// 단계별 스타일 클래스
const STAGE_CLASS = {
    '사양확인': 'spec',
    'CCB': 'ccb',
    '개발': 'dev',
    '검증': 'verify',
    '리뷰': 'review',
};

// Tasks 탭: 단계별 due offset (due_date로부터의 일 수, 음수 = 앞서야 함)
// 리뷰: due-1일, 검증: 리뷰-1일(=due-2일), 개발: 검증-2일(=due-4일),
// CCB: 개발-1일(=due-5일), 사양확인: CCB-1일(=due-6일)
const STAGE_DUE_OFFSETS = {
    '사양확인': -6,
    'CCB': -5,
    '개발': -4,
    '검증': -2,
    '리뷰': -1,
    'Done': 0,
};

// ═══════════════════════════════════════════════════════════════
// 상태 (State)
// ═══════════════════════════════════════════════════════════════

let currentTab = 'backlog';
let backlogTickets = [];        // JiraTicket[]
let tasks = [];                 // Task[]
let selectedTaskId = null;
let selectedBacklogKeys = new Set();
let existingTaskJiraKeys = new Set(); // kanban에 이미 추가된 jira key set

// ═══════════════════════════════════════════════════════════════
// 테마
// ═══════════════════════════════════════════════════════════════

function initTheme() {
    const saved = localStorage.getItem('theme');
    const hour = new Date().getHours();
    const theme = saved || ((hour >= 7 && hour < 18) ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);

    document.getElementById('themeToggle').onclick = () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    };
}

// ═══════════════════════════════════════════════════════════════
// 탭 전환
// ═══════════════════════════════════════════════════════════════

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-view').forEach(view => {
        view.style.display = 'none';
    });
    document.getElementById(`${tab}-view`).style.display = 'flex';

    if (tab === 'kanban' || tab === 'tasks') {
        fetchTasks().then(() => {
            if (tab === 'kanban') renderKanban();
            if (tab === 'tasks') renderTasksTable();
        });
    }
}

// ═══════════════════════════════════════════════════════════════
// ── BACKLOG 탭
// ═══════════════════════════════════════════════════════════════

async function queryBacklog() {
    const project = document.getElementById('backlogProject').value.trim() || 'VPC';
    const user = document.getElementById('backlogUser').value.trim() || null;
    const jql = document.getElementById('backlogJql').value.trim() || null;

    const container = document.getElementById('backlogContainer');
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⏳</div><p>조회 중...</p></div>`;

    try {
        const resp = await fetch('/api/backlog/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project, user, start_date: null, end_date: null, query_string: jql }),
        });
        backlogTickets = await resp.json();

        // 이미 kanban에 추가된 jira key 갱신
        await fetchTasks();
        existingTaskJiraKeys = new Set(tasks.map(t => t.jira_ticket_key).filter(Boolean));

        selectedBacklogKeys.clear();
        renderBacklogTree();
    } catch (err) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><p>조회 실패: ${err.message}</p></div>`;
    }
}

function renderBacklogTree() {
    const container = document.getElementById('backlogContainer');
    selectedBacklogKeys.clear();
    updateAddBtn();

    if (!backlogTickets.length) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>조회된 티켓이 없습니다.</p></div>`;
        return;
    }

    const tree = document.createElement('div');
    tree.className = 'ticket-tree';

    backlogTickets.forEach(ticket => {
        tree.appendChild(buildTreeNode(ticket, false));
    });

    container.innerHTML = '';
    const bar = document.createElement('div');
    bar.className = 'backlog-select-bar';
    bar.innerHTML = `<span id="selectedCount">0개 선택됨</span>`;
    container.appendChild(bar);
    container.appendChild(tree);
}

function buildTreeNode(ticket, isChild) {
    const hasChildren = ticket.subtasks && ticket.subtasks.length > 0;
    const alreadyAdded = existingTaskJiraKeys.has(ticket.key);

    if (isChild) {
        // 자식 노드는 간단한 행으로 표시
        const node = document.createElement('div');
        node.className = 'tree-child-node';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'tree-checkbox';
        cb.dataset.key = ticket.key;
        cb.disabled = alreadyAdded;
        cb.onchange = () => toggleBacklogSelection(ticket.key, cb.checked);

        node.innerHTML = `
            <span class="tree-ticket-key">${ticket.key}</span>
            <span class="tree-ticket-title">${ticket.title}</span>
            <span class="ticket-type-badge">${ticket.ticket_type}</span>
            ${alreadyAdded ? '<span class="already-added-badge">추가됨</span>' : ''}
        `;
        node.insertBefore(cb, node.firstChild);
        return node;
    }

    // 최상위 노드
    const node = document.createElement('div');
    node.className = 'tree-node';

    const header = document.createElement('div');
    header.className = 'tree-node-header';

    const expandBtn = document.createElement('button');
    expandBtn.className = `tree-expand-btn ${hasChildren ? '' : 'invisible'}`;
    expandBtn.textContent = '▶';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'tree-checkbox';
    cb.dataset.key = ticket.key;
    cb.disabled = alreadyAdded;
    cb.onchange = () => toggleBacklogSelection(ticket.key, cb.checked);

    const typeBadgeClass = ticket.ticket_type.toLowerCase() === 'bug' ? 'bug'
        : ticket.ticket_type.toLowerCase() === 'story' ? 'story' : '';

    header.innerHTML = `
        <span class="tree-ticket-key">${ticket.key}</span>
        <span class="tree-ticket-title">
            ${ticket.title}
            ${alreadyAdded ? '<span class="already-added-badge">추가됨</span>' : ''}
        </span>
        <div class="tree-ticket-meta">
            <span class="ticket-type-badge ${typeBadgeClass}">${ticket.ticket_type}</span>
            <span class="ticket-status-badge">${ticket.jira_status}</span>
            ${ticket.due_date ? `<span style="font-size:0.72rem;color:var(--text-secondary);">Due: ${ticket.due_date}</span>` : ''}
        </div>
    `;
    header.insertBefore(expandBtn, header.firstChild);
    header.insertBefore(cb, header.children[1]);

    node.appendChild(header);

    if (hasChildren) {
        const childrenEl = document.createElement('div');
        childrenEl.className = 'tree-node-children';
        childrenEl.style.display = 'none';

        ticket.subtasks.forEach(sub => {
            childrenEl.appendChild(buildTreeNode(sub, true));
        });
        node.appendChild(childrenEl);

        expandBtn.onclick = (e) => {
            e.stopPropagation();
            const isOpen = childrenEl.style.display !== 'none';
            childrenEl.style.display = isOpen ? 'none' : 'flex';
            expandBtn.classList.toggle('expanded', !isOpen);
        };

        // 헤더 클릭시도 토글
        header.onclick = (e) => {
            if (e.target.type === 'checkbox') return;
            expandBtn.click();
        };
    }

    return node;
}

function toggleBacklogSelection(key, checked) {
    if (checked) selectedBacklogKeys.add(key);
    else selectedBacklogKeys.delete(key);
    updateAddBtn();
}

function updateAddBtn() {
    const btn = document.getElementById('addToKanbanBtn');
    btn.disabled = selectedBacklogKeys.size === 0;
    const countEl = document.getElementById('selectedCount');
    if (countEl) countEl.textContent = `${selectedBacklogKeys.size}개 선택됨`;
}

async function addSelectedToKanban() {
    const includeSubtasks = document.getElementById('includeSubtasks').checked;
    const keys = Array.from(selectedBacklogKeys);

    try {
        const resp = await fetch('/api/tasks/from-backlog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket_keys: keys, include_subtasks: includeSubtasks }),
        });
        const created = await resp.json();
        alert(`${created.length}개의 Task가 Kanban에 추가되었습니다.`);

        // 상태 갱신
        await fetchTasks();
        existingTaskJiraKeys = new Set(tasks.map(t => t.jira_ticket_key).filter(Boolean));
        selectedBacklogKeys.clear();
        renderBacklogTree(); // 새로고침으로 "추가됨" 배지 반영
    } catch (err) {
        alert('추가 실패: ' + err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// ── KANBAN 탭
// ═══════════════════════════════════════════════════════════════

async function fetchTasks() {
    try {
        const resp = await fetch('/api/tasks');
        tasks = await resp.json();
    } catch (err) {
        console.error('Failed to fetch tasks:', err);
    }
}

function renderKanban() {
    const board = document.getElementById('kanban-board');
    board.innerHTML = '';

    // ── 예정 컬럼 ──
    board.appendChild(buildSimpleColumn('Pending', '예정', null));

    // ── 진행중 그룹: 5개 세부 컬럼 ──
    const inProgressGroup = document.createElement('div');
    inProgressGroup.className = 'kanban-inprogress-group';

    const groupHeader = document.createElement('div');
    groupHeader.className = 'kanban-group-header';
    const inProgressCount = tasks.filter(t => t.status === 'InProgress').length;
    groupHeader.innerHTML = `
        <span class="group-header-label">진행중</span>
        <span class="col-count">${inProgressCount}</span>
    `;
    inProgressGroup.appendChild(groupHeader);

    const stageColsWrapper = document.createElement('div');
    stageColsWrapper.className = 'kanban-stage-columns';

    STAGES.forEach(stage => {
        stageColsWrapper.appendChild(buildStageColumn(stage));
    });

    inProgressGroup.appendChild(stageColsWrapper);
    board.appendChild(inProgressGroup);

    // ── 완료 컬럼 ──
    board.appendChild(buildSimpleColumn('Done', '완료', null));
}

/** 예정/완료 단순 컬럼 생성 */
function buildSimpleColumn(statusId, label, _stage) {
    const colEl = document.createElement('div');
    colEl.className = 'kanban-column';
    colEl.dataset.status = statusId;

    colEl.ondragover = (e) => { e.preventDefault(); colEl.classList.add('drag-over'); };
    colEl.ondragleave = () => colEl.classList.remove('drag-over');
    colEl.ondrop = async (e) => {
        e.preventDefault();
        colEl.classList.remove('drag-over');
        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId) await moveTaskToStatusStage(Number(taskId), statusId, null);
    };

    const colTasks = tasks.filter(t => t.status === statusId);

    const header = document.createElement('div');
    header.className = 'column-header';
    header.innerHTML = `<span>${label}</span><span class="col-count">${colTasks.length}</span>`;
    colEl.appendChild(header);

    const list = document.createElement('div');
    list.className = 'task-list';
    colTasks.forEach(task => list.appendChild(buildTaskCard(task)));
    colEl.appendChild(list);
    return colEl;
}

/** InProgress 세부 단계 컬럼 생성 */
function buildStageColumn(stage) {
    const cls = STAGE_CLASS[stage] || '';
    const colEl = document.createElement('div');
    colEl.className = 'kanban-column kanban-stage-column';
    colEl.dataset.status = 'InProgress';
    colEl.dataset.stage = stage;

    colEl.ondragover = (e) => { e.preventDefault(); colEl.classList.add('drag-over'); };
    colEl.ondragleave = () => colEl.classList.remove('drag-over');
    colEl.ondrop = async (e) => {
        e.preventDefault();
        colEl.classList.remove('drag-over');
        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId) await moveTaskToStatusStage(Number(taskId), 'InProgress', stage);
    };

    // stage에 있는 task: status=InProgress이고 stage 일치하거나, stage 없으면 첫 단계(사양확인)
    const stageTasks = tasks.filter(t =>
        t.status === 'InProgress' && (t.stage === stage || (!t.stage && stage === '사양확인'))
    );

    const header = document.createElement('div');
    header.className = `column-header stage-column-header stage-header-${cls}`;
    header.innerHTML = `<span>${stage}</span><span class="col-count">${stageTasks.length}</span>`;
    colEl.appendChild(header);

    const list = document.createElement('div');
    list.className = 'task-list';
    stageTasks.forEach(task => list.appendChild(buildTaskCard(task)));
    colEl.appendChild(list);
    return colEl;
}

function buildTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card glass';
    card.draggable = true;

    card.ondragstart = (e) => {
        e.dataTransfer.setData('text/plain', String(task.id));
        setTimeout(() => card.style.opacity = '0.5', 0);
    };
    card.ondragend = () => card.style.opacity = '1';
    card.onclick = () => openTaskModal(task.id);

    const stageBadge = task.status === 'InProgress' && task.stage
        ? `<span class="stage-badge ${STAGE_CLASS[task.stage] || ''}">${task.stage}</span>` : '';

    card.innerHTML = `
        <div class="task-card-id">
            #${task.id}
            ${task.jira_ticket_key ? `<span style="color:var(--text-secondary); font-weight:400;"> · ${task.jira_ticket_key}</span>` : ''}
        </div>
        <div class="task-card-title">
            ${task.alias ? `<span class="task-card-alias">@${task.alias}</span>` : ''}
            ${task.title}
        </div>
        <div class="task-card-footer">
            ${stageBadge}
            ${task.assignee ? `<span class="assignee-chip">${task.assignee}</span>` : '<span></span>'}
            ${task.due_date ? `<span style="font-size:0.72rem; color:var(--text-secondary);">~${task.due_date}</span>` : ''}
        </div>
    `;
    return card;
}

async function moveTaskStatus(taskId, newStatus) {
    const task = tasks.find(t => t.id === taskId);
    const stage = newStatus === 'InProgress' ? (task?.stage || '사양확인') : null;
    await moveTaskToStatusStage(taskId, newStatus, stage);
}

async function moveTaskToStatusStage(taskId, newStatus, stage) {
    await fetch(`/api/tasks/${taskId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, stage }),
    });
    await fetchTasks();
    renderKanban();
}

// ═══════════════════════════════════════════════════════════════
// ── TASKS 탭 (일정표)
// ═══════════════════════════════════════════════════════════════

function buildTaskTree(tasks) {
    const map = {};
    const roots = [];
    tasks.forEach(t => { map[t.id] = { ...t, children: [] }; });
    tasks.forEach(t => {
        if (t.parent_task_id && map[t.parent_task_id]) {
            map[t.parent_task_id].children.push(map[t.id]);
        } else {
            roots.push(map[t.id]);
        }
    });
    return roots;
}

function flattenTree(nodes, depth = 0, parentStart = null, parentDue = null) {
    const result = [];
    nodes.forEach(node => {
        const inheritStart = !node.start_date;
        const inheritDue = !node.due_date;

        // 날짜 결정
        let effectiveStart = node.start_date
            || parentStart
            || node.created_at?.split('T')[0]; // 최상위이고 없으면 created_at
        let effectiveDue = node.due_date || parentDue || null; // null = 무한

        result.push({
            ...node,
            effectiveStart,
            effectiveDue,
            inheritStart: inheritStart && !!parentStart,
            inheritDue: inheritDue && !!parentDue,
            depth,
        });

        if (node.children?.length) {
            result.push(...flattenTree(node.children, depth + 1, effectiveStart, effectiveDue));
        }
    });
    return result;
}

/**
 * 이상적 진행도 계산 (0~100)
 * due_date가 null이면 진행도 0 (무한)
 */
function calcIdealProgress(startStr, dueStr) {
    if (!dueStr) return 0;
    const now = Date.now();
    const start = new Date(startStr).getTime();
    const due = new Date(dueStr).getTime();
    if (due <= start) return 100;
    return Math.min(100, Math.max(0, Math.round((now - start) / (due - start) * 100)));
}

/**
 * 실제 진행도 계산 (단계 기반)
 * 각 단계의 이상적 완료 시점을 due_date 기준으로 계산하여,
 * 현재 단계가 몇 % 위치에 있는지 반환
 */
function calcActualProgress(status, stage, startStr, dueStr) {
    if (status === 'Done') return 100;
    if (status === 'Pending') return 0;
    if (!stage) return 5;

    const stageOrder = STAGES; // 사양확인, CCB, 개발, 검증, 리뷰
    const idx = stageOrder.indexOf(stage); // 0~4
    if (idx < 0) return 5;

    // 실제 진행도: 현재 단계가 시작했으므로 해당 단계의 시작 비율 반환
    // 5단계를 균등하게 나누면 각 단계 = 20%
    return Math.round((idx / stageOrder.length) * 100) + 5; // 5% 최소값
}

function getStageColorClass(status, stage) {
    if (status === 'Done') return 'stage-color-done';
    if (status === 'Pending') return 'stage-color-pending';
    if (!stage) return 'stage-color-spec';
    const cls = STAGE_CLASS[stage];
    return cls ? `stage-color-${cls}` : 'stage-color-spec';
}

function renderTasksTable() {
    const tbody = document.getElementById('tasks-table-body');
    tbody.innerHTML = '';

    if (!tasks.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:3rem; color:var(--text-secondary);">
            Kanban에 추가된 Task가 없습니다. Backlog에서 티켓을 추가하거나 새 Task를 생성하세요.
        </td></tr>`;
        return;
    }

    const tree = buildTaskTree(tasks);
    const flat = flattenTree(tree);

    flat.forEach(row => {
        const tr = document.createElement('tr');
        const depthClass = row.depth === 1 ? 'is-child' : row.depth >= 2 ? 'is-grandchild' : '';
        if (depthClass) tr.classList.add(depthClass);
        if (row.status === 'Done') tr.classList.add('task-row-done');

        const idealPct = calcIdealProgress(row.effectiveStart, row.effectiveDue);
        const actualPct = calcActualProgress(row.status, row.stage, row.effectiveStart, row.effectiveDue);
        const colorClass = getStageColorClass(row.status, row.stage);

        const statusChipClass = row.status === 'Pending' ? 'pending'
            : row.status === 'InProgress' ? 'inprogress' : 'done';
        const statusLabel = row.status === 'Pending' ? '예정'
            : row.status === 'InProgress' ? (row.stage || '진행중') : '완료';

        // 들여쓰기 표현 (depth)
        const indent = row.depth > 0
            ? `<span style="color:var(--text-secondary); margin-right:4px;">${'└'.padStart(row.depth, '·')}</span>`
            : '';

        const startDisplay = row.effectiveStart
            ? `<span class="${row.inheritStart ? 'date-inherited' : ''}" title="${row.inheritStart ? '상위 task의 date를 따름' : ''}">${row.effectiveStart}</span>`
            : `<span class="date-infinite">–</span>`;

        const dueDisplay = row.effectiveDue
            ? `<span class="${row.inheritDue ? 'date-inherited' : ''}" title="${row.inheritDue ? '상위 task의 date를 따름' : ''}">${row.effectiveDue}</span>`
            : `<span class="date-infinite">∞ 무한</span>`;

        tr.innerHTML = `
            <td>
                <div class="task-row-id">${indent}#${row.id}</div>
                ${row.jira_ticket_key ? `<div class="task-row-jira-key">${row.jira_ticket_key}</div>` : ''}
            </td>
            <td>
                <div class="task-row-title">
                    ${row.alias ? `<span class="task-row-alias">@${row.alias}</span>` : ''}
                    ${row.title}
                </div>
            </td>
            <td style="font-size:0.82rem;">${row.assignee || '<span style="color:var(--text-secondary);">–</span>'}</td>
            <td><span class="status-chip ${statusChipClass}">${statusLabel}</span></td>
            <td class="date-cell">${startDisplay}</td>
            <td class="date-cell">${dueDisplay}</td>
            <td>
                <div class="progress-container">
                    <div class="progress-ideal ${colorClass}" style="width:${idealPct}%"></div>
                    <div class="progress-actual ${colorClass}" style="width:${actualPct}%"></div>
                </div>
                <div class="progress-label">
                    이상 ${idealPct}% · 실제 ${actualPct}%
                    ${!row.effectiveDue ? ' · <span style="color:var(--text-secondary);">기한 없음</span>' : ''}
                </div>
            </td>
        `;

        tr.style.cursor = 'pointer';
        tr.onclick = () => openTaskModal(row.id);
        tbody.appendChild(tr);
    });
}

// ═══════════════════════════════════════════════════════════════
// ── Task Modal (상세 / 수정)
// ═══════════════════════════════════════════════════════════════

async function openTaskModal(taskId) {
    selectedTaskId = taskId;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const overlay = document.getElementById('taskModalOverlay');
    const content = document.getElementById('taskModalContent');

    overlay.classList.add('open');
    content.innerHTML = `<p style="color:var(--text-secondary);">로딩 중...</p>`;

    // comments 로드
    const commResp = await fetch(`/api/tasks/${taskId}/comments`);
    const comments = await commResp.json();

    const stageOptions = STAGES.map(s =>
        `<option value="${s}" ${task.stage === s ? 'selected' : ''}>${s}</option>`
    ).join('');

    content.innerHTML = `
        <div class="modal-header">
            <div>
                <div style="font-size:0.8rem; color:var(--accent-blue); font-weight:600; margin-bottom:0.3rem;">
                    #${task.id}${task.jira_ticket_key ? ` · ${task.jira_ticket_key}` : ''}
                    ${task.jira_url ? `<a href="${task.jira_url}" target="_blank" class="jira-link" style="margin-left:0.5rem;">Jira ↗</a>` : ''}
                </div>
                <h2 style="font-size:1.1rem;">${task.title}</h2>
            </div>
            <button class="modal-close-btn" onclick="closeTaskModal()">✕</button>
        </div>

        <div class="form-grid">
            <div class="form-group span-2">
                <label>상태</label>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top:0.25rem;">
                    ${['Pending', 'InProgress', 'Done'].map(s => `
                        <button onclick="quickSetStatus('${s}')"
                            style="background:${task.status === s ? 'var(--accent-blue)' : 'transparent'};
                                   border:1px solid var(--border-color);
                                   color:${task.status === s ? 'white' : 'var(--text-secondary)'};
                                   padding:0.35rem 0.9rem; font-size:0.82rem;">
                            ${s === 'Pending' ? '예정' : s === 'InProgress' ? '진행중' : '완료'}
                        </button>
                    `).join('')}
                </div>
            </div>

            <div class="form-group" id="stageGroup" style="${task.status !== 'InProgress' ? 'display:none;' : ''}">
                <label>단계 (InProgress)</label>
                <select id="modalStage">
                    ${stageOptions}
                </select>
            </div>

            <div class="form-group">
                <label>Alias</label>
                <input type="text" id="modalAlias" value="${task.alias || ''}">
            </div>
            <div class="form-group">
                <label>담당자</label>
                <input type="text" id="modalAssignee" value="${task.assignee || ''}">
            </div>
            <div class="form-group">
                <label>Tags</label>
                <input type="text" id="modalTags" value="${task.tags || ''}" placeholder="쉼표로 구분">
            </div>
            <div class="form-group">
                <label>Keywords</label>
                <input type="text" id="modalKeywords" value="${task.keywords || ''}">
            </div>
            <div class="form-group">
                <label>Start Date</label>
                <input type="date" id="modalStartDate" value="${task.start_date || ''}">
            </div>
            <div class="form-group">
                <label>Due Date</label>
                <input type="date" id="modalDueDate" value="${task.due_date || ''}">
            </div>
        </div>

        <div style="display:flex; gap:0.75rem; margin-top:1.25rem; flex-wrap:wrap;">
            <button onclick="saveTaskDetail(${taskId})">저장</button>
            <button onclick="closeTaskModal()" class="btn-secondary">취소</button>
            <button onclick="deleteTask(${taskId})" class="btn-danger" style="margin-left:auto;">삭제</button>
        </div>

        <div class="comment-section">
            <h3 style="font-size:0.9rem; font-weight:700; margin-bottom:0.5rem;">💬 코멘트</h3>
            <div class="comment-list">
                ${comments.length === 0
            ? `<p style="color:var(--text-secondary); font-size:0.85rem;">코멘트 없음</p>`
            : comments.map(c => `
                        <div class="comment-item">
                            <div class="comment-meta">
                                <span>${c.author}</span>
                                <span>${new Date(c.created_at).toLocaleString('ko-KR')}</span>
                            </div>
                            <div class="comment-body">${c.content}</div>
                            ${c.attachments ? `<div style="margin-top:0.4rem; font-size:0.78rem;"><a href="${c.attachments}" target="_blank" style="color:var(--accent-blue);">📎 첨부</a></div>` : ''}
                        </div>
                    `).join('')
        }
            </div>
            <div class="comment-input-area">
                <textarea id="commentInput" placeholder="코멘트를 입력하세요..."></textarea>
                <input type="text" id="commentAttachment" placeholder="첨부 URL (선택)">
                <button onclick="submitComment(${taskId})">코멘트 추가</button>
            </div>
        </div>
    `;
}

function quickSetStatus(status) {
    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task) return;

    // UI 즉시 반영
    const stageGroup = document.getElementById('stageGroup');
    if (stageGroup) stageGroup.style.display = status === 'InProgress' ? '' : 'none';

    // 버튼 색상 업데이트
    document.querySelectorAll('#taskModalContent .form-group button').forEach(btn => {
        const s = btn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
        if (s) {
            btn.style.background = s === status ? 'var(--accent-blue)' : 'transparent';
            btn.style.color = s === status ? 'white' : 'var(--text-secondary)';
        }
    });

    // status를 임시 저장 (save 버튼으로 확정)
    if (stageGroup) stageGroup.dataset.pendingStatus = status;
}

async function saveTaskDetail(taskId) {
    const stageGroup = document.getElementById('stageGroup');
    const pendingStatus = stageGroup?.dataset.pendingStatus;
    const task = tasks.find(t => t.id === taskId);

    // 상태 변경이 있으면 먼저 처리
    if (pendingStatus && pendingStatus !== task?.status) {
        const stage = pendingStatus === 'InProgress'
            ? (document.getElementById('modalStage')?.value || '사양확인')
            : null;
        await fetch(`/api/tasks/${taskId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: pendingStatus, stage }),
        });
    } else if (task?.status === 'InProgress') {
        // 상태는 그대로인데 stage만 변경된 경우
        const newStage = document.getElementById('modalStage')?.value;
        if (newStage && newStage !== task.stage) {
            await fetch(`/api/tasks/${taskId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'InProgress', stage: newStage }),
            });
        }
    }

    // 메타데이터 업데이트
    const payload = {
        alias: document.getElementById('modalAlias')?.value || null,
        assignee: document.getElementById('modalAssignee')?.value || null,
        tags: document.getElementById('modalTags')?.value || null,
        keywords: document.getElementById('modalKeywords')?.value || null,
        start_date: document.getElementById('modalStartDate')?.value || null,
        due_date: document.getElementById('modalDueDate')?.value || null,
    };

    await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    await fetchTasks();
    closeTaskModal();
    if (currentTab === 'kanban') renderKanban();
    if (currentTab === 'tasks') renderTasksTable();
}

async function deleteTask(taskId) {
    if (!confirm('이 Task를 삭제하시겠습니까? 삭제된 Task는 복구할 수 없습니다.')) return;
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    await fetchTasks();
    closeTaskModal();
    if (currentTab === 'kanban') renderKanban();
    if (currentTab === 'tasks') renderTasksTable();
}

async function submitComment(taskId) {
    const content = document.getElementById('commentInput').value.trim();
    const attachments = document.getElementById('commentAttachment').value.trim();
    if (!content) return;

    await fetch(`/api/tasks/${taskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: 'Team Member', content, attachments: attachments || null }),
    });
    openTaskModal(taskId); // 모달 새로고침
}

function closeTaskModal() {
    document.getElementById('taskModalOverlay').classList.remove('open');
    selectedTaskId = null;
}

// ═══════════════════════════════════════════════════════════════
// ── 새 Task 생성 Modal
// ═══════════════════════════════════════════════════════════════

function openNewTaskModal() {
    document.getElementById('newTaskModalOverlay').classList.add('open');
}

function closeNewTaskModal() {
    document.getElementById('newTaskModalOverlay').classList.remove('open');
}

async function submitNewTask() {
    const title = document.getElementById('newTaskTitle').value.trim();
    if (!title) { alert('제목을 입력하세요.'); return; }

    const payload = {
        title,
        description: document.getElementById('newTaskDesc').value.trim() || null,
        alias: document.getElementById('newTaskAlias').value.trim() || null,
        assignee: document.getElementById('newTaskAssignee').value.trim() || null,
        start_date: document.getElementById('newTaskStartDate').value || null,
        due_date: document.getElementById('newTaskDueDate').value || null,
        jira_ticket_key: null,
        project_key: null,
        parent_task_id: null,
        jira_url: null,
    };

    await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    closeNewTaskModal();
    await fetchTasks();
    renderKanban();
}

// ═══════════════════════════════════════════════════════════════
// 초기화
// ═══════════════════════════════════════════════════════════════

// 탭 버튼 클릭
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
});

// Backlog 버튼
document.getElementById('backlogQueryBtn').onclick = queryBacklog;
document.getElementById('addToKanbanBtn').onclick = addSelectedToKanban;

// Kanban: 새 Task 추가
document.getElementById('newTaskBtn').onclick = openNewTaskModal;

// Modal 외부 클릭 시 닫기
document.getElementById('taskModalOverlay').onclick = (e) => {
    if (e.target === document.getElementById('taskModalOverlay')) closeTaskModal();
};
document.getElementById('newTaskModalOverlay').onclick = (e) => {
    if (e.target === document.getElementById('newTaskModalOverlay')) closeNewTaskModal();
};

// 초기 실행
initTheme();
// 최초에는 kanban 탭 데이터를 미리 로드 (탭 전환 시 바로 보이게)
fetchTasks();
