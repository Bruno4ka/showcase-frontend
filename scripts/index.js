const API_BASE_URL = 'http://localhost:8080/api';
const API_PROJECTS_ENDPOINT = '/projects';

const STATUS_MAP = {
    'new': 'AVAILABLE',
    'active': 'IN_PROGRESS',
    'completed': 'COMPLETED'
};

let paginationState = {
    currentPage: 0,
    size: 20,
    totalPages: 0,
    isLoading: false
};

let currentFilters = {
    status: 'AVAILABLE',
    projectType: '',
    department: '',
    title: ''
};

let searchTimeout = null;

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function handleProfileClick() {
    const token = localStorage.getItem('authToken');
    window.location.href = token ? '/profile.html' : '/entrance.html';
}

function goToProfile() {
    const token = localStorage.getItem('authToken');
    if (token) {
        // Если токен есть — идем в профиль
        window.location.href = '/profile.html';
    } else {
        // Если токена нет — идем на вход
        window.location.href = '/entrance.html';
    }
}

function buildProjectsUrl(filters, page = 0) {
    const url = new URL(API_BASE_URL + API_PROJECTS_ENDPOINT);

    if (filters.status) {
        url.searchParams.append('project-status', filters.status);
    }
    if (filters.projectType) {
        url.searchParams.append('project-type', filters.projectType);
    }
    if (filters.department) {
        url.searchParams.append('department', filters.department);
    }
    if (filters.title) {
        url.searchParams.append('title', filters.title);
    }

    url.searchParams.append('page', page);
    url.searchParams.append('size', paginationState.size);

    return url.toString();
}

async function fetchProjects(page = 0, append = false) {
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
        paginationState.currentPage = data.number || data.currentPage || 0;

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

    updateLoadMoreButton();
}

function updateLoadMoreButton() {
    const btn = document.getElementById('load-more');
    if (!btn) return;

    if ((paginationState.currentPage + 1) < paginationState.totalPages) {
        btn.style.display = 'block';
        btn.textContent = 'Показать еще проекты';
    } else {
        btn.style.display = 'none';
    }
}

function loadMoreProjects() {
    if (paginationState.isLoading) return;
    const nextPage = paginationState.currentPage + 1;
    fetchProjects(nextPage, true);
}

async function loadProjects(resetPage = true) {
    if (resetPage) {
        paginationState.currentPage = 0;
    }
    await fetchProjects(paginationState.currentPage, false);
}

function setupTabListeners() {
    document.querySelectorAll('.btn-tab').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const projectType = this.dataset.project;
            currentFilters.status = STATUS_MAP[projectType] || 'AVAILABLE';

            loadProjects(true);
        });
    });
}

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

        document.querySelectorAll('.dropdown').forEach(d => { if (d.id !== dropdownId) d.classList.remove('show'); });
        document.querySelectorAll('.filter-select').forEach(b => { if (b !== btn) b.classList.remove('active'); });

        dropdown.classList.toggle('show');
        btn.classList.toggle('active');
    };

    window.selectFilter = function (dropdownId, labelId, value) {
        document.getElementById(labelId).textContent = value;
        document.getElementById(dropdownId).classList.remove('show');
        const btn = document.querySelector(`button[onclick*="${dropdownId}"]`);
        if (btn) btn.classList.remove('active');

        if (dropdownId === 'dropdown-type') {
            currentFilters.projectType = (value === 'Тип проекта') ? '' : value;
        } else if (dropdownId === 'dropdown-dept') {
            currentFilters.department = (value === 'Кафедра') ? '' : value;
        }

        loadProjects(true);
    };
}

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

window.viewProject = function (id) {
    alert(`Переход к проекту ID: ${id}`);
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('load-more').addEventListener('click', loadMoreProjects);

    setupTabListeners();
    setupMobileSelector();
    setupFilterListeners();
    setupSearchListener();

    currentFilters.status = STATUS_MAP['new'];
    loadProjects(true);
});