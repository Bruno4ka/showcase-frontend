const API_BASE_URL = 'http://localhost:8080/api';
const API_PROJECTS_ENDPOINT = '/projects';
const TOKEN_KEY = 'authToken';
const REFRESH_TOKEN_KEY = 'refreshToken';

const STATUS_MAP = {
    'new': 'AVAILABLE',
    'active': 'IN_PROGRESS',
    'completed': 'COMPLETED'
};

// ===== СОСТОЯНИЕ ПАГИНАЦИИ =====
let paginationState = {
    currentPage: 0,
    size: 20,
    totalPages: 0,
    isLoading: false
};

let displayedProjectsCount = 0;
const PROJECTS_PER_PAGE = 20;

// ===== ФИЛЬТРЫ С ПОДДЕРЖКОЙ МНОЖЕСТВЕННОГО ВЫБОРА =====
let currentFilters = {
    status: 'AVAILABLE',
    projectTypes: [],  // массив для множественного выбора
    departments: [],   // массив для множественного выбора
    title: ''
};

let searchTimeout = null;

// ===== УТИЛИТЫ ДЛЯ РАБОТЫ С ТОКЕНАМИ =====
function decodeToken(token) {
    try {
        const payload = token.split('.')[1];
        return JSON.parse(atob(payload));
    } catch (e) {
        return null;
    }
}

function isTokenExpired(token) {
    const payload = decodeToken(token);
    if (!payload || !payload.exp) return true;
    return payload.exp * 1000 < Date.now();
}

async function refreshAccessToken() {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) return false;
    
    try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        });
        
        if (response.ok) {
            const data = await response.json();
            localStorage.setItem(TOKEN_KEY, data.accessToken);
            if (data.refreshToken) {
                localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
            }
            return true;
        }
        return false;
    } catch (e) {
        return false;
    }
}

async function validateToken(token) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/validate`, {
            method: 'GET',
            headers: { 
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        return response.ok;
    } catch (e) {
        return false;
    }
}

// ===== ПРОВЕРКА АВТОРИЗАЦИИ ПРИ ПЕРЕХОДЕ В ПРОФИЛЬ =====
async function goToProfile() {
    let token = localStorage.getItem(TOKEN_KEY);
    
    if (!token) {
        window.location.href = '/entrance.html';
        return;
    }
    
    // Проверяем истечение и обновляем при необходимости
    if (isTokenExpired(token)) {
        const refreshed = await refreshAccessToken();
        token = localStorage.getItem(TOKEN_KEY);
        if (!refreshed || !token) {
            clearAuth();
            window.location.href = '/entrance.html';
            return;
        }
    }
    
    // Валидация токена через эндпоинт
    const isValid = await validateToken(token);
    if (!isValid) {
        clearAuth();
        window.location.href = '/entrance.html';
        return;
    }
    
    // Проверка роли через декодирование
    const payload = decodeToken(token);
    if (payload?.role) {
        // Можно добавить редирект в зависимости от роли
        // if (payload.role === 'ADMIN') window.location.href = '/admin-profile.html';
    }
    
    window.location.href = '/profile.html';
}

// ===== ОЧИСТКА АВТОРИЗАЦИИ ПРИ ВЫХОДЕ =====
function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem('user');
}

function logout() {
    clearAuth();
    window.location.href = '/entrance.html';
}

// ===== ESCAPE HTML =====
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== ПОСТРОЕНИЕ URL С ФИЛЬТРАМИ =====
function buildProjectsUrl(filters, page = 0) {
    const url = new URL(API_BASE_URL + API_PROJECTS_ENDPOINT);

    if (filters.status) {
        url.searchParams.append('project-status', filters.status);
    }
    
    // Множественный выбор для типов проектов
    if (filters.projectTypes?.length > 0) {
        filters.projectTypes.forEach(type => 
            url.searchParams.append('project-type', type)
        );
    }
    
    // Множественный выбор для кафедр
    if (filters.departments?.length > 0) {
        filters.departments.forEach(dept => 
            url.searchParams.append('department', dept)
        );
    }
    
    if (filters.title) {
        url.searchParams.append('title', filters.title);
    }

    url.searchParams.append('page', page);
    url.searchParams.append('size', paginationState.size);

    return url.toString();
}

// ===== ЗАГРУЗКА ПРОЕКТОВ =====
async function fetchProjects(page = 0, append = false) {
    if (paginationState.isLoading) return;
    
    try {
        paginationState.isLoading = true;
        const btnLoadMore = document.getElementById('load-more');
        if (btnLoadMore) btnLoadMore.textContent = 'Загрузка...';

        const url = buildProjectsUrl(currentFilters, page);
        console.log('Запрос к API:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        const projects = data.content || data.projects || [];

        paginationState.totalPages = data.totalPages || 0;
        paginationState.currentPage = data.number !== undefined ? data.number : (data.currentPage !== undefined ? data.currentPage : page);

        renderProjects(projects, append);

    } catch (error) {
        console.error('Ошибка при загрузке:', error);
        if (!append) {
            document.querySelector('.cards').innerHTML = `<li class="error">Ошибка загрузки</li>`;
        }
    } finally {
        paginationState.isLoading = false;
        updateLoadMoreButton();
    }
}

function renderProjects(projects, append = false) {
    const cardsContainer = document.querySelector('.cards');
    const btnLoadMore = document.getElementById('load-more');
    
    if (!append) {
        cardsContainer.innerHTML = '';
        displayedProjectsCount = 0;
        if (btnLoadMore) btnLoadMore.style.display = 'none';
    }
    
    if (projects.length === 0 && !append) {
        cardsContainer.innerHTML = `<li class="empty">Проекты не найдены</li>`;
        return;
    }
    
    const newCardsHTML = projects.map(project => {
        const title = escapeHtml(project.title || 'Без названия');
        const dept = escapeHtml(project.department || 'Не указана');
        const target = escapeHtml(project.target || 'Нет описания');
        const id = project.id || 0;
        const status = project.status;

        let btnClass = 'btn-blue';
        if (status === 'IN_PROGRESS') btnClass = 'btn-lightblue';
        if (status === 'COMPLETED' || status === 'REJECTED') btnClass = 'btn-grey';

        return `
            <li>
                <article class="card">
                    <div class="card-title">${title}</div>
                    <div class="card-dept"><span>Кафедра:</span> ${dept}</div>
                    <div class="card-goal"><strong>Цель:</strong> ${target}</div>
                    <button class="card-btn ${btnClass}" onclick="viewProject(${id})">Подробнее</button>
                </article>
            </li>
        `;
    }).join('');
    
    cardsContainer.insertAdjacentHTML('beforeend', newCardsHTML);
    displayedProjectsCount += projects.length;
    
    updateLoadMoreButton();
}

function updateLoadMoreButton() {
    const btn = document.getElementById('load-more');
    if (!btn) return;
    
    if (paginationState.currentPage < paginationState.totalPages - 1) {
        btn.style.display = 'block';
        btn.textContent = 'Показать еще проекты';
    } else {
        btn.style.display = 'none';
    }
}

function loadMoreProjects() {
    if (paginationState.isLoading) return;
    const nextPage = paginationState.currentPage + 1;
    fetchProjects(nextPage, true); // true = append
}

// ===== ПЕРЕЗАГРУЗКА ПРОЕКТОВ С СБРОСОМ =====
async function loadProjects(resetPage = true) {
    if (resetPage) {
        paginationState.currentPage = 0;
        displayedProjectsCount = 0;
    }
    await fetchProjects(paginationState.currentPage, !resetPage);
}

function resetFilters() {
    currentFilters = {
        status: currentFilters.status,
        projectTypes: [],
        departments: [],
        title: ''
    };
    
    document.getElementById('label-type').textContent = 'Тип проекта';
    document.getElementById('label-dept').textContent = 'Кафедра';
    document.querySelector('.search-box input').value = '';
    
    document.querySelectorAll('.dropdown-item input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    
    loadProjects(true);
}

function setupTabListeners() {
    document.querySelectorAll('.btn-tab').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const projectType = this.dataset.project;
            currentFilters.status = STATUS_MAP[projectType] || 'AVAILABLE';
            
            currentFilters.projectTypes = [];
            currentFilters.departments = [];
            document.getElementById('label-type').textContent = 'Тип проекта';
            document.getElementById('label-dept').textContent = 'Кафедра';
            
            loadProjects(true);
        });
    });
}

// ===== МОБИЛЬНЫЙ СЕЛЕКТОР =====
function setupMobileSelector() {
    window.toggleMobileDropdown = function () {
        const dropdown = document.getElementById('mobileDropdown');
        const btn = document.getElementById('mobileProjectBtn');
        dropdown.classList.toggle('show');
        btn.classList.toggle('open');
    };

    window.selectMobileProject = function (value, item) {
        document.getElementById('mobileProjectLabel').textContent = value;
        document.getElementById('mobileDropdown').classList.remove('show');
        document.getElementById('mobileProjectBtn').classList.remove('open');

        document.querySelectorAll('.mobile-dropdown-item').forEach(i => i.classList.remove('active-mobile'));
        item.classList.add('active-mobile');

        const statusMap = {
            'НОВЫЕ ПРОЕКТЫ': 'new',
            'АКТИВНЫЕ ПРОЕКТЫ': 'active',
            'ЗАВЕРШЕННЫЕ ПРОЕКТЫ': 'completed'
        };

        currentFilters.status = STATUS_MAP[statusMap[value]] || 'AVAILABLE';
        loadProjects(true);
    };
}

function setupFilterListeners() {
    window.toggleFilter = function (dropdownId, btn) {
        const dropdown = document.getElementById(dropdownId);
        const isOpen = dropdown.classList.contains('show');

        document.querySelectorAll('.dropdown').forEach(d => { 
            if (d.id !== dropdownId) d.classList.remove('show'); 
        });
        document.querySelectorAll('.filter-select').forEach(b => { 
            if (b !== btn) b.classList.remove('active'); 
        });

        dropdown.classList.toggle('show');
        btn.classList.toggle('active');
    };

    window.selectFilter = function (dropdownId, value, checkbox) {
        const isChecked = checkbox.checked;
        
        if (dropdownId === 'dropdown-type') {
            if (isChecked) {
                if (!currentFilters.projectTypes.includes(value)) {
                    currentFilters.projectTypes.push(value);
                }
            } else {
                currentFilters.projectTypes = currentFilters.projectTypes.filter(t => t !== value);
            }
            // Обновляем метку
            const count = currentFilters.projectTypes.length;
            document.getElementById('label-type').textContent = count > 0 
                ? `Тип проекта (${count})` 
                : 'Тип проекта';
        } else if (dropdownId === 'dropdown-dept') {
            if (isChecked) {
                if (!currentFilters.departments.includes(value)) {
                    currentFilters.departments.push(value);
                }
            } else {
                currentFilters.departments = currentFilters.departments.filter(d => d !== value);
            }

            const count = currentFilters.departments.length;
            document.getElementById('label-dept').textContent = count > 0 
                ? `Кафедра (${count})` 
                : 'Кафедра';
        }
        
        loadProjects(true);
    };
    
    // Кнопка сброса фильтров
    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn-reset-filters';
    resetBtn.textContent = '✕ Сбросить';
    resetBtn.onclick = resetFilters;
    
    const filtersLeft = document.querySelector('.filters-left');
    if (filtersLeft) {
        filtersLeft.appendChild(resetBtn);
    }
}

// ===== ПОИСК =====
function setupSearchListener() {
    const searchInput = document.querySelector('.search-box input');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentFilters.title = e.target.value.trim();
            loadProjects(true);
        }, 500);
    });
}

// ===== ПРОСМОТР ПРОЕКТА =====
window.viewProject = function (id) {
    alert(`Переход к проекту ID: ${id}`);
};

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', () => {
    // Кнопка "Показать ещё"
    document.getElementById('load-more')?.addEventListener('click', loadMoreProjects);

    setupTabListeners();
    setupMobileSelector();
    setupFilterListeners();
    setupSearchListener();

    currentFilters.status = STATUS_MAP['new'];
    loadProjects(true);
    
    // Периодическая проверка токена (раз в 5 минут)
    setInterval(async () => {
        const token = localStorage.getItem(TOKEN_KEY);
        if (token && isTokenExpired(token)) {
            await refreshAccessToken();
        }
    }, 5 * 60 * 1000);
});