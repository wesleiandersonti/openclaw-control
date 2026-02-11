/**
 * OpenClaw Control - Projects Module
 */

// Global state
let projects = [];

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

// Format currency
function formatCurrency(value) {
  if (value === null || value === undefined) return '-';
  return `$${Number(value).toFixed(2)}`;
}

// Format date
function formatDate(timestamp) {
  if (!timestamp) return '-';
  return new Date(Number(timestamp)).toLocaleDateString('pt-BR');
}

// ==================== PROJECTS ====================

async function loadProjects() {
  showLoading(true);
  try {
    const statusFilter = document.getElementById('statusFilter').value;
    const url = statusFilter ? `/api/projects?status=${statusFilter}` : '/api/projects';
    const data = await api(url);
    projects = data.items || [];
    
    // Load stats for each project
    for (let project of projects) {
      try {
        const stats = await api(`/api/projects/${project.id}/stats`);
        project.stats = stats;
      } catch (e) {
        project.stats = null;
      }
    }
    
    renderProjects();
  } catch (error) {
    console.error('Error loading projects:', error);
    alert('Erro ao carregar projetos: ' + error.message);
  } finally {
    showLoading(false);
  }
}

function renderProjects() {
  const grid = document.getElementById('projectsGrid');
  
  if (projects.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px; color: #8b949e;">
        <p style="font-size: 18px; margin-bottom: 8px;">Nenhum projeto encontrado</p>
        <p style="font-size: 14px;">Clique em "Novo Projeto" para começar</p>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = projects.map(project => renderProjectCard(project)).join('');
}

function renderProjectCard(project) {
  const stats = project.stats || {};
  const budgetUsedPercent = stats.budgetUsedPercent || 0;
  let budgetClass = 'low';
  if (budgetUsedPercent > 50) budgetClass = 'medium';
  if (budgetUsedPercent > 80) budgetClass = 'high';
  
  const isPaused = project.status === 'paused';
  const isCompleted = project.status === 'completed';
  
  return `
    <div class="project-card">
      <div class="project-header">
        <span class="project-title">${escapeHtml(project.name)}</span>
        <span class="project-status status-${project.status}">${project.status}</span>
      </div>
      
      ${project.description ? `<p class="project-description">${escapeHtml(project.description)}</p>` : ''}
      
      <div class="project-stats">
        <div class="stat-item">
          <div class="stat-value">${stats.totalTasks || 0}</div>
          <div class="stat-label">Tarefas</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.totalAiExecutions || 0}</div>
          <div class="stat-label">Exec. IA</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${formatCurrency(stats.totalCostUsd)}</div>
          <div class="stat-label">Custo Total</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${formatCurrency(project.budget_usd)}</div>
          <div class="stat-label">Orçamento</div>
        </div>
      </div>
      
      ${project.budget_usd ? `
        <div class="budget-section">
          <div class="budget-header">
            <span>Orçamento utilizado</span>
            <span>${budgetUsedPercent.toFixed(1)}%</span>
          </div>
          <div class="budget-bar">
            <div class="budget-progress ${budgetClass}" style="width: ${Math.min(budgetUsedPercent, 100)}%"></div>
          </div>
        </div>
      ` : ''}
      
      <div class="project-actions">
        <button class="btn-action btn-kanban" onclick="openKanban(${project.id})" ${isCompleted ? 'disabled' : ''}>
          📋 Kanban
        </button>
        
        ${!isPaused && !isCompleted ? `
          <button class="btn-action btn-pause" onclick="pauseProject(${project.id})">
            ⏸️ Pausar
          </button>
        ` : ''}
        
        ${!isCompleted ? `
          <button class="btn-action btn-complete" onclick="completeProject(${project.id})">
            ✅ Finalizar
          </button>
        ` : ''}
        
        <button class="btn-action btn-secondary" onclick="editProject(${project.id})">
          ✏️ Editar
        </button>
      </div>
    </div>
  `;
}

async function createProject(data) {
  try {
    await api('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    
    await loadProjects();
    closeModal('projectModal');
    document.getElementById('projectForm').reset();
    document.getElementById('projectId').value = '';
  } catch (error) {
    alert('Erro ao criar projeto: ' + error.message);
  }
}

async function updateProject(projectId, data) {
  try {
    await api(`/api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    
    await loadProjects();
    closeModal('projectModal');
    document.getElementById('projectForm').reset();
    document.getElementById('projectId').value = '';
  } catch (error) {
    alert('Erro ao atualizar projeto: ' + error.message);
  }
}

async function pauseProject(projectId) {
  if (!confirm('Tem certeza que deseja pausar este projeto? As execuções de IA serão bloqueadas.')) return;
  
  try {
    await api(`/api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'paused' })
    });
    
    await loadProjects();
  } catch (error) {
    alert('Erro ao pausar projeto: ' + error.message);
  }
}

async function completeProject(projectId) {
  if (!confirm('Tem certeza que deseja finalizar este projeto? Não será possível criar novas tarefas.')) return;
  
  try {
    await api(`/api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed' })
    });
    
    await loadProjects();
  } catch (error) {
    alert('Erro ao finalizar projeto: ' + error.message);
  }
}

function openKanban(projectId) {
  // Store project ID and redirect to kanban
  localStorage.setItem('currentProjectId', projectId);
  window.location.href = '/dashboard.html';
}

function openProjectModal(projectId = null) {
  const modalTitle = document.getElementById('modalTitle');
  
  if (projectId) {
    const project = projects.find(p => p.id === projectId);
    if (project) {
      document.getElementById('projectId').value = project.id;
      document.getElementById('projectName').value = project.name;
      document.getElementById('projectDescription').value = project.description || '';
      document.getElementById('projectBudget').value = project.budget_usd || '';
      document.getElementById('projectStatus').value = project.status;
      modalTitle.textContent = 'Editar Projeto';
    }
  } else {
    document.getElementById('projectForm').reset();
    document.getElementById('projectId').value = '';
    document.getElementById('projectStatus').value = 'active';
    modalTitle.textContent = 'Novo Projeto';
  }
  
  openModal('projectModal');
}

function editProject(projectId) {
  openProjectModal(projectId);
}

// ==================== HELPERS ====================

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', () => {
  // Check auth
  if (!checkAuth()) return;
  
  // Load projects
  loadProjects();
  
  // New project button
  document.getElementById('newProjectBtn').addEventListener('click', () => {
    openProjectModal();
  });
  
  // Status filter
  document.getElementById('statusFilter').addEventListener('change', () => {
    loadProjects();
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
  
  // Project form
  document.getElementById('projectForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const projectId = document.getElementById('projectId').value;
    const data = {
      name: document.getElementById('projectName').value.trim(),
      description: document.getElementById('projectDescription').value.trim(),
      status: document.getElementById('projectStatus').value
    };
    
    const budget = document.getElementById('projectBudget').value;
    if (budget) {
      data.budgetUsd = Number(budget);
    }
    
    if (projectId) {
      updateProject(Number(projectId), data);
    } else {
      createProject(data);
    }
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
});
