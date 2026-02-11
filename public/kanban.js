/**
 * OpenClaw Control - Kanban Module
 * Professional Kanban board with drag & drop
 */

// Global state
let currentBoardId = null;
let boards = [];
let columns = [];
let tasks = [];
let draggedTask = null;

// Check authentication
function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/';
    return false;
  }
  return token;
}

// API helper
async function api(url, options = {}) {
  const token = localStorage.getItem('token');
  
  const defaultOptions = {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  
  const response = await fetch(url, { ...defaultOptions, ...options });
  
  if (response.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/';
    return;
  }
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

// Show/hide loading
function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('hidden', !show);
}

// Modal helpers
function openModal(modalId) {
  document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
}

// Format date
function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(Number(timestamp));
  const now = new Date();
  const diff = now - date;
  
  // If less than 24 hours, show relative time
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Agora';
    if (hours === 1) return '1h atrás';
    return `${hours}h atrás`;
  }
  
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Check if overdue
function isOverdue(timestamp) {
  if (!timestamp) return false;
  return Date.now() > Number(timestamp);
}

// Priority label
function getPriorityLabel(priority) {
  const labels = {
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
    critical: 'Crítica'
  };
  return labels[priority] || priority;
}

// Status label
function getStatusLabel(status) {
  const labels = {
    open: 'Aberto',
    in_progress: 'Em Progresso',
    done: 'Concluído'
  };
  return labels[status] || status;
}

// ==================== BOARDS ====================

async function loadBoards() {
  try {
    const data = await api('/api/kanban/boards');
    boards = data.items || [];
    
    const selector = document.getElementById('boardSelector');
    selector.innerHTML = '<option value="">Selecionar Board...</option>';
    
    boards.forEach(board => {
      const option = document.createElement('option');
      option.value = board.id;
      option.textContent = board.name;
      if (board.id === currentBoardId) {
        option.selected = true;
      }
      selector.appendChild(option);
    });
    
    if (boards.length > 0 && !currentBoardId) {
      currentBoardId = boards[0].id;
      selector.value = currentBoardId;
      await loadBoardData();
    }
  } catch (error) {
    console.error('Error loading boards:', error);
    alert('Erro ao carregar boards: ' + error.message);
  }
}

async function createBoard(name, description) {
  try {
    const board = await api('/api/kanban/boards', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    });
    
    currentBoardId = board.id;
    await loadBoards();
    await loadBoardData();
    closeModal('boardModal');
    document.getElementById('boardForm').reset();
  } catch (error) {
    alert('Erro ao criar board: ' + error.message);
  }
}

// ==================== COLUMNS ====================

async function loadColumns() {
  if (!currentBoardId) return;
  
  try {
    const data = await api(`/api/kanban/columns?boardId=${currentBoardId}`);
    columns = data.items || [];
    renderColumns();
  } catch (error) {
    console.error('Error loading columns:', error);
  }
}

async function createColumn(name) {
  if (!currentBoardId) {
    alert('Selecione um board primeiro');
    return;
  }
  
  try {
    await api('/api/kanban/columns', {
      method: 'POST',
      body: JSON.stringify({ boardId: currentBoardId, name })
    });
    
    await loadColumns();
    await loadTasks();
    closeModal('columnModal');
    document.getElementById('columnForm').reset();
  } catch (error) {
    alert('Erro ao criar coluna: ' + error.message);
  }
}

function renderColumns() {
  const container = document.getElementById('columnsContainer');
  container.innerHTML = '';
  
  columns.forEach(column => {
    const columnEl = document.createElement('div');
    columnEl.className = 'column';
    columnEl.dataset.columnId = column.id;
    
    // Count tasks for this column
    const columnTasks = tasks.filter(t => t.column_id === column.id);
    
    columnEl.innerHTML = `
      <div class="column-header">
        <span class="column-title">${escapeHtml(column.name)}</span>
        <span class="column-count">${columnTasks.length}</span>
      </div>
      <div class="column-tasks" data-column-id="${column.id}">
        ${columnTasks.map(task => renderTaskCard(task)).join('')}
      </div>
      <div class="column-footer">
        <button class="btn-add-task" onclick="openTaskModal(${column.id})">
          <span>+</span>
          <span>Adicionar tarefa</span>
        </button>
      </div>
    `;
    
    // Setup drag & drop for column
    const tasksContainer = columnEl.querySelector('.column-tasks');
    setupColumnDropZone(tasksContainer);
    
    container.appendChild(columnEl);
  });
}

// ==================== TASKS ====================

async function loadTasks() {
  if (!currentBoardId) return;
  
  try {
    const data = await api(`/api/kanban/tasks?boardId=${currentBoardId}`);
    tasks = data.items || [];
    renderColumns(); // Re-render columns with tasks
  } catch (error) {
    console.error('Error loading tasks:', error);
  }
}

function renderTaskCard(task) {
  const overdue = isOverdue(task.due_date);
  const hasLLM = task.provider && task.model;
  
  return `
    <div class="task-card" draggable="true" data-task-id="${task.id}" data-column-id="${task.column_id}">
      <div class="task-priority priority-${task.priority || 'medium'}"></div>
      <div class="task-header">
        <span class="task-title">${escapeHtml(task.title)}</span>
        <div class="task-actions">
          <button class="task-btn" onclick="editTask(${task.id})" title="Editar">✏️</button>
          <button class="task-btn" onclick="deleteTask(${task.id})" title="Excluir">🗑️</button>
        </div>
      </div>
      ${task.description ? `<p style="font-size: 12px; color: #8b949e; margin-top: 4px;">${escapeHtml(task.description.substring(0, 100))}${task.description.length > 100 ? '...' : ''}</p>` : ''}
      <div class="task-meta">
        <span class="task-badge badge-status-${task.status === 'in_progress' ? 'progress' : task.status}">
          ${getStatusLabel(task.status)}
        </span>
        ${task.due_date ? `
          <span class="task-due-date ${overdue ? 'overdue' : ''}">
            📅 ${formatDate(task.due_date)}
          </span>
        ` : ''}
        ${hasLLM ? `
          <span class="task-badge badge-llm" onclick="window.open('/api/sessions/${task.session_id}', '_blank')" title="Abrir Sessão LLM">
            🤖 ${escapeHtml(task.model)}
          </span>
        ` : ''}
      </div>
    </div>
  `;
}

async function createTask(data) {
  try {
    await api('/api/kanban/tasks', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    await loadTasks();
    closeModal('taskModal');
    document.getElementById('taskForm').reset();
  } catch (error) {
    alert('Erro ao criar tarefa: ' + error.message);
  }
}

async function updateTask(taskId, data) {
  try {
    await api(`/api/kanban/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    
    await loadTasks();
    closeModal('taskModal');
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
  } catch (error) {
    alert('Erro ao atualizar tarefa: ' + error.message);
  }
}

async function moveTask(taskId, columnId, position) {
  try {
    await api(`/api/kanban/tasks/${taskId}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ columnId, position })
    });
    
    await loadTasks();
  } catch (error) {
    console.error('Error moving task:', error);
    alert('Erro ao mover tarefa: ' + error.message);
  }
}

async function deleteTask(taskId) {
  if (!confirm('Tem certeza que deseja excluir esta tarefa?')) return;
  
  try {
    await api(`/api/kanban/tasks/${taskId}`, {
      method: 'DELETE'
    });
    
    await loadTasks();
  } catch (error) {
    alert('Erro ao excluir tarefa: ' + error.message);
  }
}

// ==================== MODALS ====================

function openTaskModal(columnId, taskId = null) {
  if (columnId) {
    document.getElementById('taskColumnId').value = columnId;
  }
  
  if (taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      document.getElementById('taskId').value = task.id;
      document.getElementById('taskTitle').value = task.title;
      document.getElementById('taskDescription').value = task.description || '';
      document.getElementById('taskPriority').value = task.priority;
      document.getElementById('taskStatus').value = task.status;
      document.getElementById('taskColumnId').value = task.column_id;
      document.getElementById('taskProvider').value = task.provider || '';
      document.getElementById('taskModel').value = task.model || '';
      document.getElementById('taskSessionId').value = task.session_id || '';
      if (task.due_date) {
        document.getElementById('taskDueDate').value = new Date(Number(task.due_date)).toISOString().slice(0, 16);
      }
      document.getElementById('modalTitle').textContent = 'Editar Tarefa';
    }
  } else {
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    document.getElementById('modalTitle').textContent = 'Nova Tarefa';
  }
  
  openModal('taskModal');
}

function editTask(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (task) {
    openTaskModal(task.column_id, taskId);
  }
}

// ==================== DRAG & DROP ====================

function setupDragAndDrop() {
  document.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('task-card')) {
      draggedTask = {
        id: e.target.dataset.taskId,
        columnId: e.target.dataset.columnId
      };
      e.target.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    }
  });
  
  document.addEventListener('dragend', (e) => {
    if (e.target.classList.contains('task-card')) {
      e.target.classList.remove('dragging');
      draggedTask = null;
      document.querySelectorAll('.column').forEach(col => {
        col.classList.remove('drag-over');
      });
    }
  });
  
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    const column = e.target.closest('.column');
    if (column && draggedTask) {
      column.classList.add('drag-over');
    }
  });
  
  document.addEventListener('dragleave', (e) => {
    const column = e.target.closest('.column');
    if (column) {
      column.classList.remove('drag-over');
    }
  });
}

function setupColumnDropZone(container) {
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const afterElement = getDragAfterElement(container, e.clientY);
    const draggable = document.querySelector('.dragging');
    if (!draggable) return;
    
    if (afterElement) {
      container.insertBefore(draggable, afterElement);
    } else {
      container.appendChild(draggable);
    }
  });
  
  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    const columnEl = container.closest('.column');
    if (!columnEl || !draggedTask) return;
    
    const newColumnId = columnEl.dataset.columnId;
    const taskEl = document.querySelector(`[data-task-id="${draggedTask.id}"]`);
    if (!taskEl) return;
    
    // Calculate new position
    const siblings = [...container.querySelectorAll('.task-card')];
    const newPosition = siblings.indexOf(taskEl);
    
    // Only update if position or column changed
    if (draggedTask.columnId !== newColumnId || newPosition !== -1) {
      await moveTask(draggedTask.id, newColumnId, newPosition);
    }
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.task-card:not(.dragging)')];
  
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ==================== HELPERS ====================

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadBoardData() {
  showLoading(true);
  await Promise.all([loadColumns(), loadTasks()]);
  showLoading(false);
}

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', () => {
  // Check auth
  if (!checkAuth()) return;
  
  // Setup drag & drop
  setupDragAndDrop();
  
  // Load initial data
  loadBoards();
  
  // Board selector
  document.getElementById('boardSelector').addEventListener('change', (e) => {
    currentBoardId = e.target.value ? Number(e.target.value) : null;
    if (currentBoardId) {
      loadBoardData();
    }
  });
  
  // New board button
  document.getElementById('newBoardBtn').addEventListener('click', () => {
    openModal('boardModal');
  });
  
  // New column button
  document.getElementById('newColumnBtn').addEventListener('click', () => {
    if (!currentBoardId) {
      alert('Selecione um board primeiro');
      return;
    }
    openModal('columnModal');
  });
  
  // Logout button
  document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = '/';
  });
  
  // Modal close buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(btn.dataset.close);
    });
  });
  
  // Close modal on backdrop click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal.id);
      }
    });
  });
  
  // Board form
  document.getElementById('boardForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('boardName').value.trim();
    const description = document.getElementById('boardDescription').value.trim();
    if (name) {
      createBoard(name, description);
    }
  });
  
  // Column form
  document.getElementById('columnForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('columnName').value.trim();
    if (name) {
      createColumn(name);
    }
  });
  
  // Task form
  document.getElementById('taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const taskId = document.getElementById('taskId').value;
    const data = {
      boardId: currentBoardId,
      columnId: Number(document.getElementById('taskColumnId').value),
      title: document.getElementById('taskTitle').value.trim(),
      description: document.getElementById('taskDescription').value.trim(),
      priority: document.getElementById('taskPriority').value,
      status: document.getElementById('taskStatus').value,
      provider: document.getElementById('taskProvider').value || null,
      model: document.getElementById('taskModel').value || null,
      sessionId: document.getElementById('taskSessionId').value || null
    };
    
    const dueDateInput = document.getElementById('taskDueDate').value;
    if (dueDateInput) {
      data.dueDate = new Date(dueDateInput).getTime();
    }
    
    if (taskId) {
      updateTask(taskId, data);
    } else {
      createTask(data);
    }
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
});
