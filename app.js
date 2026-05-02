/* ========================================
   MIMO TODO - 智能日程管理
   应用逻辑 (REST API 版本)
   ======================================== */

const API = '/api/schedules';

// ========================================
// 粒子系统
// ========================================
class ParticleSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.mouse = { x: null, y: null };
        this.resize();
        this.init();
        this.bindEvents();
        this.animate();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    init() {
        const count = Math.floor((this.canvas.width * this.canvas.height) / 15000);
        this.particles = [];
        for (let i = 0; i < count; i++) {
            this.particles.push(this.createParticle());
        }
    }

    createParticle() {
        const isOrange = Math.random() > 0.35;
        return {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            radius: Math.random() * 1.5 + 0.5,
            opacity: Math.random() * 0.4 + 0.1,
            color: isOrange ? [255, 140, 50] : [139, 92, 246],
        };
    }

    bindEvents() {
        window.addEventListener('resize', () => { this.resize(); this.init(); });
        window.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
        window.addEventListener('mouseout', () => { this.mouse.x = null; this.mouse.y = null; });
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.particles.forEach((p, i) => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;
            if (this.mouse.x !== null) {
                const dx = this.mouse.x - p.x;
                const dy = this.mouse.y - p.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 150) {
                    const force = (150 - dist) / 150 * 0.02;
                    p.vx += dx * force;
                    p.vy += dy * force;
                }
            }
            p.vx *= 0.99;
            p.vy *= 0.99;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${p.opacity})`;
            this.ctx.fill();
            for (let j = i + 1; j < this.particles.length; j++) {
                const p2 = this.particles[j];
                const dx = p.x - p2.x;
                const dy = p.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    const mc = [(p.color[0] + p2.color[0]) / 2, (p.color[1] + p2.color[1]) / 2, (p.color[2] + p2.color[2]) / 2];
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.strokeStyle = `rgba(${mc[0]}, ${mc[1]}, ${mc[2]}, ${0.06 * (1 - dist / 120)})`;
                    this.ctx.lineWidth = 0.5;
                    this.ctx.stroke();
                }
            }
        });
        requestAnimationFrame(() => this.animate());
    }
}

// ========================================
// API 请求封装
// ========================================
async function apiGet() {
    const res = await fetch(API);
    return res.json();
}

async function apiPost(data) {
    const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

async function apiPut(id, data) {
    const res = await fetch(`${API}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

async function apiDelete(id) {
    const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
    return res.json();
}

async function apiToggle(id) {
    const res = await fetch(`${API}/${id}/toggle`, { method: 'PATCH' });
    return res.json();
}

// ========================================
// 应用状态
// ========================================
let schedules = [];
let currentFilter = 'all';
let searchQuery = '';

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new ParticleSystem(document.getElementById('particleCanvas'));
    updateClock();
    setInterval(updateClock, 1000);
    loadSchedules();
    setDefaultFormValues();
});

// 加载所有日程
async function loadSchedules() {
    try {
        schedules = await apiGet();
        schedules = schedules.map(s => ({
            ...s,
            start: s.start || s.start_time,
            end: s.end || s.end_time,
            completed: !!s.completed,
        }));
    } catch (err) {
        console.error('加载日程失败:', err);
        schedules = [];
    }
    refreshDashboard();
    renderSchedules();
}

// 时钟
function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('zh-CN', { hour12: false });
    const date = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
    document.getElementById('currentTime').textContent = `${date} ${time}`;
}

// 页面切换
function switchPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`).classList.add('active');
    const titles = { dashboard: '仪表盘', create: '新建日程', schedules: '查看日程' };
    const breadcrumbs = { dashboard: '首页 / 仪表盘', create: '首页 / 新建日程', schedules: '首页 / 查看日程' };
    document.getElementById('pageTitle').textContent = titles[page];
    document.getElementById('breadcrumb').textContent = breadcrumbs[page];
    if (page === 'dashboard') refreshDashboard();
    if (page === 'schedules') renderSchedules();
    closeMobileMenu();
}

// 移动端菜单
function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobileOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}

function closeMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobileOverlay');
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
}

// 创建标签切换
function switchCreateTab(tab) {
    const manualBtn = document.getElementById('tabManual');
    const smartBtn = document.getElementById('tabSmart');
    const indicator = document.getElementById('tabIndicator');
    const manualContent = document.getElementById('content-manual');
    const smartContent = document.getElementById('content-smart');
    if (tab === 'manual') {
        manualBtn.classList.add('active');
        smartBtn.classList.remove('active');
        indicator.classList.remove('right');
        manualContent.classList.add('active');
        smartContent.classList.remove('active');
    } else {
        manualBtn.classList.remove('active');
        smartBtn.classList.add('active');
        indicator.classList.add('right');
        manualContent.classList.remove('active');
        smartContent.classList.add('active');
    }
}

// 设置默认表单值（整点逻辑）
function setDefaultFormValues() {
    const now = new Date();
    const start = new Date(now);
    start.setMinutes(0, 0, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 2);
    document.getElementById('scheduleStart').value = formatDateTimeLocal(start);
    document.getElementById('scheduleEnd').value = formatDateTimeLocal(end);
}

function formatDateTimeLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}`;
}

// 刷新仪表盘
function refreshDashboard() {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);

    const today = schedules.filter(s => {
        const d = new Date(s.start);
        return d >= todayStart && d < todayEnd;
    });
    const completed = schedules.filter(s => s.completed);
    const pending = schedules.filter(s => !s.completed);

    document.getElementById('totalSchedules').textContent = schedules.length;
    document.getElementById('todaySchedules').textContent = today.length;
    document.getElementById('completedSchedules').textContent = completed.length;
    document.getElementById('pendingSchedules').textContent = pending.length;

    const todayList = document.getElementById('todayScheduleList');
    if (today.length === 0) {
        todayList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 64 64" fill="none" stroke="var(--cyan)" stroke-width="1" opacity="0.4">
                    <circle cx="32" cy="32" r="28"/>
                    <line x1="32" y1="20" x2="32" y2="34"/>
                    <circle cx="32" cy="40" r="2" fill="var(--cyan)"/>
                </svg>
                <p>今日暂无日程安排</p>
            </div>`;
    } else {
        todayList.innerHTML = today.slice(0, 5).map(s => {
            const timeInfo = formatTimeDisplay(s.start, s.end);
            return `
            <div class="schedule-item" style="margin-bottom: 8px;">
                <div class="schedule-priority ${s.priority}"></div>
                <div class="schedule-info">
                    <div class="schedule-title">${escapeHtml(s.title)}</div>
                    <div class="schedule-desc">${escapeHtml(s.description || '暂无描述')}</div>
                </div>
                <div class="schedule-time">
                    <div class="schedule-time-main">${timeInfo.time}</div>
                    <div class="schedule-time-date">${timeInfo.date}</div>
                </div>
            </div>`;
        }).join('');
    }
}

// 手动创建日程
async function handleManualSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('scheduleTitle').value.trim();
    const start = document.getElementById('scheduleStart').value;
    const end = document.getElementById('scheduleEnd').value;
    const desc = document.getElementById('scheduleDesc').value.trim();
    const priority = document.querySelector('input[name="priority"]:checked').value;
    const urgency = document.querySelector('input[name="urgency"]:checked').value;

    if (!title || !start || !end) { showToast('请填写完整信息', 'error'); return false; }
    if (new Date(end) <= new Date(start)) { showToast('结束时间必须晚于开始时间', 'error'); return false; }

    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    await apiPost({ id, title, description: desc, start, end, priority, urgency });

    document.getElementById('manualForm').reset();
    setDefaultFormValues();
    showToast('日程创建成功');
    await loadSchedules();
    return false;
}

// 智能排序评分
function getSmartScore(schedule) {
    const now = new Date();
    const start = new Date(schedule.start);
    const end = new Date(schedule.end);
    const msUntilStart = start.getTime() - now.getTime();
    const totalDuration = end.getTime() - start.getTime();
    let timeScore;
    if (msUntilStart < 0) {
        const msAfterEnd = now.getTime() - end.getTime();
        timeScore = msAfterEnd > 0 ? 95 : 80 + 15 * (1 - msAfterEnd / totalDuration);
    } else {
        const hoursLeft = msUntilStart / (1000 * 60 * 60);
        timeScore = hoursLeft <= 0 ? 100 : hoursLeft <= 1 ? 90 : hoursLeft <= 2 ? 80
            : hoursLeft <= 6 ? 65 : hoursLeft <= 24 ? 45 : hoursLeft <= 72 ? 25 : 10;
    }
    const priorityMap = { high: 100, medium: 60, low: 20 };
    const urgencyMap = { critical: 100, urgent: 70, normal: 30 };
    const completedBonus = schedule.completed ? -200 : 0;
    return timeScore * 0.5 + (priorityMap[schedule.priority] || 20) * 0.25
        + (urgencyMap[schedule.urgency] || 30) * 0.25 + completedBonus;
}

function getUrgencyLabel(urgency) {
    return { critical: '非常紧急', urgent: '紧急', normal: '一般' }[urgency] || '一般';
}

// 渲染日程列表
function renderSchedules() {
    const container = document.getElementById('schedulesList');
    let list = schedules;

    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        list = list.filter(s => s.title.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q)));
    }
    if (currentFilter === 'completed') list = list.filter(s => s.completed);
    else if (currentFilter === 'pending') list = list.filter(s => !s.completed);

    if (list.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 80 80" fill="none" stroke="var(--cyan)" stroke-width="1" opacity="0.3">
                    <circle cx="40" cy="40" r="36"/>
                    <rect x="24" y="24" width="32" height="32" rx="4"/>
                    <line x1="24" y1="34" x2="56" y2="34"/>
                    <line x1="32" y1="20" x2="32" y2="28"/>
                    <line x1="48" y1="20" x2="48" y2="28"/>
                </svg>
                <p>${searchQuery ? '未找到匹配的日程' : '暂无日程安排'}</p>
                ${!searchQuery ? '<button class="btn btn-primary btn-sm" onclick="switchPage(\'create\')">创建第一个日程</button>' : ''}
            </div>`;
        return;
    }

    list.sort((a, b) => getSmartScore(b) - getSmartScore(a));

    container.innerHTML = list.map(s => {
        const urgencyClass = s.urgency || 'normal';
        const timeInfo = formatTimeDisplay(s.start, s.end);
        const completedTime = s.completed && s.completed_at ? formatCompletedTime(s.completed_at) : '';
        return `
        <div class="schedule-item ${s.completed ? 'completed' : ''}" data-id="${s.id}" onclick="openDetailModal('${s.id}')" style="cursor:pointer">
            <div class="schedule-priority ${s.priority}"></div>
            <div class="schedule-info">
                <div class="schedule-title">${escapeHtml(s.title)}</div>
                <div class="schedule-desc">${escapeHtml(s.description || '暂无描述')}</div>
                <div class="schedule-meta">
                    <span class="meta-tag priority-tag-${s.priority}">${s.priority === 'high' ? '高优先级' : s.priority === 'medium' ? '中优先级' : '低优先级'}</span>
                    <span class="meta-tag urgency-tag-${urgencyClass}">${getUrgencyLabel(s.urgency)}</span>
                    ${completedTime ? `<span class="meta-tag completed-tag">${completedTime}</span>` : ''}
                </div>
            </div>
            <div class="schedule-time">
                <div class="schedule-time-main">${timeInfo.time}</div>
                <div class="schedule-time-date">${timeInfo.date}</div>
            </div>
            <div class="schedule-actions">
                <button class="complete-btn ${s.completed ? 'done' : ''}" onclick="event.stopPropagation(); toggleComplete('${s.id}')" title="${s.completed ? '标为未完成' : '标为已完成'}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>
                </button>
                <button class="edit-btn" onclick="event.stopPropagation(); openEditModal('${s.id}')" title="编辑">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="delete-btn" onclick="event.stopPropagation(); deleteSchedule('${s.id}')" title="删除">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3,6 5,6 21,6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        </div>`;
    }).join('');
}

// 切换完成状态
async function toggleComplete(id) {
    await apiToggle(id);
    await loadSchedules();
    showToast('状态已更新');
}

// 删除日程
async function deleteSchedule(id) {
    if (!confirm('确定要删除该日程吗？')) return;
    await apiDelete(id);
    await loadSchedules();
    showToast('日程已删除');
}

// 打开编辑模态框
function openEditModal(id) {
    const s = schedules.find(x => x.id === id);
    if (!s) return;
    document.getElementById('editId').value = id;
    document.getElementById('editTitle').value = s.title;
    document.getElementById('editStart').value = formatDateTimeLocal(new Date(s.start));
    document.getElementById('editEnd').value = formatDateTimeLocal(new Date(s.end));
    document.getElementById('editDesc').value = s.description || '';
    const pr = document.querySelector(`input[name="editPriority"][value="${s.priority}"]`);
    if (pr) pr.checked = true;
    const ur = document.querySelector(`input[name="editUrgency"][value="${s.urgency || 'normal'}"]`);
    if (ur) ur.checked = true;
    document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
}

// 提交编辑
async function handleEditSubmit(e) {
    if (e) e.preventDefault();
    const id = document.getElementById('editId').value;
    const title = document.getElementById('editTitle').value.trim();
    const start = document.getElementById('editStart').value;
    const end = document.getElementById('editEnd').value;
    const desc = document.getElementById('editDesc').value.trim();
    const priority = document.querySelector('input[name="editPriority"]:checked').value;
    const urgency = document.querySelector('input[name="editUrgency"]:checked').value;

    if (!title || !start || !end) { showToast('请填写完整信息', 'error'); return false; }
    if (new Date(end) <= new Date(start)) { showToast('结束时间必须晚于开始时间', 'error'); return false; }

    const s = schedules.find(x => x.id === id);
    await apiPut(id, { title, description: desc, start, end, priority, urgency, completed: s ? s.completed : false });
    closeEditModal();
    await loadSchedules();
    showToast('日程已更新');
    return false;
}

// 过滤状态
function filterByStatus(status, btn) {
    currentFilter = status;
    searchQuery = '';
    document.getElementById('searchInput').value = '';
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderSchedules();
}

// ========================================
// 模糊搜索（带下拉）
// ========================================
let searchTimeout = null;
let currentDetailId = null;

function handleSearchInput() {
    const q = document.getElementById('searchInput').value.trim();
    if (searchTimeout) clearTimeout(searchTimeout);
    if (!q) {
        hideSearchDropdown();
        searchQuery = '';
        renderSchedules();
        return;
    }
    searchTimeout = setTimeout(() => fuzzySearch(q), 300);
}

async function fuzzySearch(q) {
    try {
        const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
        const results = await res.json();
        showSearchDropdown(results);
    } catch (err) {
        console.error('搜索失败:', err);
        hideSearchDropdown();
    }
}

function showSearchDropdown(results) {
    const dropdown = document.getElementById('searchDropdown');
    if (!results.length) {
        dropdown.innerHTML = '<div class="search-dropdown-empty">未找到匹配日程</div>';
        dropdown.classList.add('active');
        return;
    }
    dropdown.innerHTML = results.slice(0, 8).map(s => {
        const timeInfo = formatTimeDisplay(s.start, s.end);
        const score = s.score || 0;
        return `
        <div class="search-dropdown-item ${s.completed ? 'completed' : ''}" onclick="openDetailFromSearch('${s.id}')">
            <div class="search-dropdown-info">
                <div class="search-dropdown-title">${escapeHtml(s.title)}</div>
                <div class="search-dropdown-meta">
                    <span class="meta-tag priority-tag-${s.priority}">${s.priority === 'high' ? '高' : s.priority === 'medium' ? '中' : '低'}</span>
                    <span class="search-dropdown-time">${timeInfo.date} ${timeInfo.time}</span>
                </div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16">
                <polyline points="9,18 15,12 9,6"/>
            </svg>
        </div>`;
    }).join('');
    dropdown.classList.add('active');
}

function hideSearchDropdown() {
    document.getElementById('searchDropdown').classList.remove('active');
}

function openDetailFromSearch(id) {
    hideSearchDropdown();
    document.getElementById('searchInput').value = '';
    openDetailModal(id);
}

// 点击外部关闭搜索下拉
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) hideSearchDropdown();
});

// ========================================
// 日程详情模态框
// ========================================
async function openDetailModal(id) {
    const s = schedules.find(x => x.id === id);
    if (!s) return;
    currentDetailId = id;

    document.getElementById('detailTitle').textContent = s.title;

    const statusEl = document.getElementById('detailStatus');
    if (s.completed) {
        statusEl.innerHTML = '<span class="meta-tag completed-tag">已完成</span>';
    } else {
        statusEl.innerHTML = '<span class="meta-tag urgency-tag-normal">进行中</span>';
    }

    const timeInfo = formatTimeDisplay(s.start, s.end);
    document.getElementById('detailTime').textContent = `${timeInfo.date} ${timeInfo.time}`;

    const pMap = { high: '高', medium: '中', low: '低' };
    document.getElementById('detailPriority').innerHTML = `<span class="meta-tag priority-tag-${s.priority}">${pMap[s.priority] || '低'}</span>`;

    const uMap = { critical: '非常紧急', urgent: '紧急', normal: '一般' };
    const uClass = s.urgency || 'normal';
    document.getElementById('detailUrgency').innerHTML = `<span class="meta-tag urgency-tag-${uClass}">${uMap[uClass] || '一般'}</span>`;

    const completedRow = document.getElementById('detailCompletedRow');
    if (s.completed && s.completed_at) {
        completedRow.style.display = '';
        document.getElementById('detailCompletedAt').textContent = formatCompletedTime(s.completed_at);
    } else {
        completedRow.style.display = 'none';
    }

    document.getElementById('detailDesc').textContent = s.description || '暂无描述';

    await loadAchievements(id);

    document.getElementById('detailModal').classList.add('active');
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('active');
    currentDetailId = null;
}

function editFromDetail() {
    if (!currentDetailId) return;
    closeDetailModal();
    openEditModal(currentDetailId);
}

// 点击模态框外部关闭
document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDetailModal();
});

// ========================================
// 成果管理
// ========================================
async function loadAchievements(id) {
    try {
        const res = await fetch(`${API}/${id}/achievements`);
        const achievements = await res.json();
        renderAchievements(achievements);
    } catch (err) {
        console.error('加载成果失败:', err);
        document.getElementById('achievementsList').innerHTML = '<div class="achievements-empty">暂无成果记录</div>';
    }
}

function renderAchievements(achievements) {
    const container = document.getElementById('achievementsList');
    if (!achievements || !achievements.length) {
        container.innerHTML = '<div class="achievements-empty">暂无成果记录，可在下方添加</div>';
        return;
    }
    container.innerHTML = achievements.map(a => {
        let content = '';
        if (a.type === 'text') {
            content = `<div class="achievement-text">${escapeHtml(a.text)}</div>`;
        } else if (a.type === 'image') {
            content = `<div class="achievement-image"><img src="/uploads/${a.file}" alt="${escapeHtml(a.originalName || '图片')}" onclick="window.open(this.src)"></div>`;
        } else if (a.type === 'video') {
            content = `<div class="achievement-video"><video src="/uploads/${a.file}" controls></video></div>`;
        } else {
            content = `<div class="achievement-file"><a href="/uploads/${a.file}" target="_blank">${escapeHtml(a.originalName || '文件')}</a></div>`;
        }
        const time = a.createdAt ? new Date(a.createdAt).toLocaleString('zh-CN') : '';
        return `
        <div class="achievement-item" data-ach-id="${a.id}">
            <div class="achievement-header">
                <span class="achievement-type-badge ${a.type}">${a.type === 'text' ? '文字' : a.type === 'image' ? '图片' : a.type === 'video' ? '视频' : '文件'}</span>
                <span class="achievement-time">${time}</span>
                <button class="achievement-delete" onclick="deleteAchievement('${a.id}')" title="删除">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            ${content}
        </div>`;
    }).join('');
}

async function addTextAchievement() {
    if (!currentDetailId) return;
    const input = document.getElementById('achievementTextInput');
    const text = input.value.trim();
    if (!text) { showToast('请输入成果内容', 'error'); return; }
    try {
        const res = await fetch(`${API}/${currentDetailId}/achievements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        const data = await res.json();
        if (data.success) {
            input.value = '';
            renderAchievements(data.achievements);
            showToast('成果已添加');
        }
    } catch (err) {
        showToast('添加失败', 'error');
    }
}

async function uploadFileAchievement() {
    if (!currentDetailId) return;
    const fileInput = document.getElementById('achievementFileInput');
    const file = fileInput.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
        const res = await fetch(`${API}/${currentDetailId}/achievements/upload`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            fileInput.value = '';
            renderAchievements(data.achievements);
            showToast('文件上传成功');
        } else {
            showToast(data.error || '上传失败', 'error');
        }
    } catch (err) {
        showToast('上传失败', 'error');
    }
}

async function deleteAchievement(achId) {
    if (!currentDetailId) return;
    if (!confirm('确定要删除该成果吗？')) return;
    try {
        const res = await fetch(`${API}/${currentDetailId}/achievements/${achId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            renderAchievements(data.achievements);
            showToast('成果已删除');
        }
    } catch (err) {
        showToast('删除失败', 'error');
    }
}

// Toast 通知
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// HTML 转义
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// 格式化完成时间
function formatCompletedTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return `完成于 今天 ${h}:${min}`;
    return `完成于 ${month}/${day} ${h}:${min}`;
}

// 格式化时间显示
function formatTimeDisplay(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    const now = new Date();
    const sh = String(s.getHours()).padStart(2, '0');
    const smin = String(s.getMinutes()).padStart(2, '0');
    const eh = String(e.getHours()).padStart(2, '0');
    const emin = String(e.getMinutes()).padStart(2, '0');
    const time = `${sh}:${smin} - ${eh}:${emin}`;
    const isToday = s.toDateString() === now.toDateString();
    const isTomorrow = new Date(now.getTime() + 86400000).toDateString() === s.toDateString();
    let date;
    if (isToday) date = '今天';
    else if (isTomorrow) date = '明天';
    else {
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        date = `${s.getMonth() + 1}月${s.getDate()}日 ${weekdays[s.getDay()]}`;
    }
    return { time, date };
}

// 点击模态框外部关闭
document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEditModal();
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeEditModal();
        closeDetailModal();
        hideSearchDropdown();
    }
});

// ========================================
// AI 智能日程创建
// ========================================
let aiSessionId = 'session_' + Date.now().toString(36);
let aiProcessing = false;

function sendAiExample(btn) {
    const text = btn.textContent;
    document.getElementById('aiInput').value = text;
    sendAiMessage();
}

async function sendAiMessage() {
    if (aiProcessing) return;
    const input = document.getElementById('aiInput');
    const message = input.value.trim();
    if (!message) return;

    aiProcessing = true;
    input.value = '';
    const sendBtn = document.getElementById('aiSendBtn');
    sendBtn.disabled = true;

    renderAiMessage('user', message);

    const loadingId = 'loading_' + Date.now();
    renderAiMessage('assistant', '<div class="ai-typing"><span></span><span></span><span></span></div>', loadingId);

    try {
        const res = await fetch('/api/ai/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, sessionId: aiSessionId }),
        });
        const data = await res.json();

        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();

        if (!data.success) {
            renderAiMessage('assistant', `<span class="ai-error">${escapeHtml(data.error || '请求失败')}</span>`);
            return;
        }

        if (data.reply) {
            renderAiMessage('assistant', formatAiReply(data.reply));
        }

        if (data.schedules && data.schedules.length) {
            renderAiSchedulePreview(data.schedules);
        }
    } catch (err) {
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        renderAiMessage('assistant', `<span class="ai-error">网络错误，请检查连接后重试</span>`);
    } finally {
        aiProcessing = false;
        sendBtn.disabled = false;
        input.focus();
    }
}

function renderAiMessage(role, html, id) {
    const body = document.getElementById('aiChatBody');
    const isUser = role === 'user';
    const div = document.createElement('div');
    div.className = `ai-msg ${isUser ? 'ai-msg-user' : 'ai-msg-bot'}`;
    if (id) div.id = id;
    div.innerHTML = `
        <div class="ai-avatar ${isUser ? 'ai-avatar-user' : 'ai-avatar-bot'}">
            ${isUser
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.5 4.5-3 6l-1 3H9l-1-3c-1.5-1.5-3-3.5-3-6a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/></svg>'
            }
        </div>
        <div class="ai-msg-content">${html}</div>
    `;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
}

function formatAiReply(text) {
    return escapeHtml(text)
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function renderAiSchedulePreview(schedules) {
    const body = document.getElementById('aiChatBody');
    const div = document.createElement('div');
    div.className = 'ai-msg ai-msg-bot';
    div.innerHTML = `
        <div class="ai-avatar ai-avatar-bot">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.5 4.5-3 6l-1 3H9l-1-3c-1.5-1.5-3-3.5-3-6a7 7 0 0 1 7-7z"/>
                <line x1="9" y1="21" x2="15" y2="21"/>
            </svg>
        </div>
        <div class="ai-msg-content">
            <div class="ai-schedule-preview">
                <div class="ai-preview-title">识别到 ${schedules.length} 个日程：</div>
                ${schedules.map((s, i) => {
                    const timeInfo = formatTimeDisplay(s.start, s.end);
                    const pMap = { high: '高', medium: '中', low: '低' };
                    const uMap = { critical: '非常紧急', urgent: '紧急', normal: '一般' };
                    return `
                    <div class="ai-preview-item">
                        <div class="ai-preview-num">${i + 1}</div>
                        <div class="ai-preview-info">
                            <div class="ai-preview-name">${escapeHtml(s.title || '未命名')}</div>
                            <div class="ai-preview-meta">
                                <span class="meta-tag priority-tag-${s.priority || 'low'}">${pMap[s.priority] || '低'}</span>
                                <span class="meta-tag urgency-tag-${s.urgency || 'normal'}">${uMap[s.urgency] || '一般'}</span>
                                <span class="ai-preview-time">${timeInfo.date} ${timeInfo.time}</span>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
                <div class="ai-preview-actions">
                    <button class="btn btn-primary btn-sm" onclick="confirmAiSchedules(this)" data-schedules='${escapeHtml(JSON.stringify(schedules))}'>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20,6 9,17 4,12"/></svg>
                        确认创建
                    </button>
                    <button class="btn btn-ghost btn-sm" onclick="this.closest('.ai-msg').remove()">取消</button>
                </div>
            </div>
        </div>
    `;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
}

async function confirmAiSchedules(btn) {
    const schedules = JSON.parse(btn.dataset.schedules);
    btn.disabled = true;
    btn.textContent = '创建中...';
    try {
        const res = await fetch('/api/ai/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schedules }),
        });
        const data = await res.json();
        if (data.success) {
            btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="20,6 9,17 4,12"/></svg> 已创建 ' + data.created.length + ' 个日程';
            btn.className = 'btn btn-sm';
            btn.style.background = 'rgba(52,211,153,0.15)';
            btn.style.color = 'var(--green)';
            btn.style.borderColor = 'rgba(52,211,153,0.3)';
            showToast('日程创建成功');
            await loadSchedules();
        } else {
            showToast(data.error || '创建失败', 'error');
            btn.disabled = false;
            btn.textContent = '确认创建';
        }
    } catch (err) {
        showToast('网络错误', 'error');
        btn.disabled = false;
        btn.textContent = '确认创建';
    }
}

async function clearAiChat() {
    try {
        await fetch('/api/ai/clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: aiSessionId }),
        });
    } catch {}
    aiSessionId = 'session_' + Date.now().toString(36);
    const body = document.getElementById('aiChatBody');
    body.innerHTML = `
        <div class="ai-welcome">
            <div class="ai-avatar ai-avatar-bot">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.5 4.5-3 6l-1 3H9l-1-3c-1.5-1.5-3-3.5-3-6a7 7 0 0 1 7-7z"/>
                    <line x1="9" y1="21" x2="15" y2="21"/>
                </svg>
            </div>
            <div class="ai-welcome-text">
                <p>对话已清空，有什么日程需要安排？</p>
                <div class="ai-examples">
                    <button class="ai-example-btn" onclick="sendAiExample(this)">明天下午2点到4点开项目会议，高优先级</button>
                    <button class="ai-example-btn" onclick="sendAiExample(this)">帮我安排下周的复习计划，周一到周五每天晚上8点到10点</button>
                    <button class="ai-example-btn" onclick="sendAiExample(this)">后天上午面试，非常紧急</button>
                </div>
            </div>
        </div>`;
}

// ========================================
// 语音输入
// ========================================
let recognition = null;
let isRecording = false;

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const rec = new SpeechRecognition();
    rec.lang = 'zh-CN';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event) => {
        const input = document.getElementById('aiInput');
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }
        if (finalTranscript) {
            input.value = (input.value + finalTranscript).trim();
        }
        const hint = document.getElementById('voiceInterimHint');
        if (hint) {
            hint.textContent = interimTranscript || (finalTranscript ? '已识别，继续说话...' : '正在聆听...');
            hint.style.display = 'block';
        }
    };

    rec.onerror = (event) => {
        console.error('语音识别错误:', event.error);
        if (event.error === 'not-allowed') {
            showToast('请允许麦克风权限', 'error');
        } else if (event.error === 'no-speech') {
            showToast('未检测到语音，请重试', 'error');
        } else if (event.error !== 'aborted') {
            showToast('语音识别出错: ' + event.error, 'error');
        }
        stopRecording();
    };

    rec.onend = () => {
        if (isRecording) {
            try { rec.start(); } catch {}
        }
    };

    return rec;
}

function toggleVoiceInput() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    if (!recognition) {
        recognition = initSpeechRecognition();
    }
    if (!recognition) {
        showToast('当前浏览器不支持语音输入，请使用 Chrome 或 Edge', 'error');
        return;
    }

    isRecording = true;
    const btn = document.getElementById('aiVoiceBtn');
    btn.classList.add('recording');
    btn.querySelector('.mic-icon').style.display = 'none';
    btn.querySelector('.stop-icon').style.display = 'block';

    const input = document.getElementById('aiInput');
    let hint = document.getElementById('voiceInterimHint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'voiceInterimHint';
        hint.className = 'voice-interim-hint';
        input.parentNode.appendChild(hint);
    }
    hint.textContent = '正在聆听...';
    hint.style.display = 'block';

    try {
        recognition.start();
    } catch {}
}

function stopRecording() {
    isRecording = false;
    if (recognition) {
        try { recognition.stop(); } catch {}
    }
    const btn = document.getElementById('aiVoiceBtn');
    if (btn) {
        btn.classList.remove('recording');
        btn.querySelector('.mic-icon').style.display = 'block';
        btn.querySelector('.stop-icon').style.display = 'none';
    }
    const hint = document.getElementById('voiceInterimHint');
    if (hint) hint.style.display = 'none';
}

// ========================================
// 日程提醒通知
// ========================================
const notifiedSchedules = new Set();
let notificationTimer = null;

function requestNotificationPermission() {
    if (!('Notification' in window)) {
        showNotificationBar('当前浏览器不支持系统通知，请使用 Chrome 或 Edge');
        return;
    }
    if (Notification.permission === 'granted') return;
    if (Notification.permission === 'denied') {
        showNotificationBar('通知已被禁用，请在浏览器设置中允许通知');
        return;
    }
    Notification.requestPermission().then(perm => {
        if (perm !== 'granted') {
            showNotificationBar('未允许通知，请点击地址栏左侧图标手动开启通知权限');
        }
    });
}

function showNotificationBar(msg) {
    if (document.getElementById('notifPermissionBar')) return;
    const bar = document.createElement('div');
    bar.id = 'notifPermissionBar';
    bar.className = 'notif-permission-bar';
    bar.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <span>${msg}</span>
        <button onclick="requestNotificationPermission(); this.parentElement.remove()">开启通知</button>
        <button onclick="this.parentElement.remove()" class="notif-bar-close">&times;</button>
    `;
    document.body.appendChild(bar);
}

function startNotificationChecker() {
    requestNotificationPermission();
    checkScheduleNotifications();
    notificationTimer = setInterval(checkScheduleNotifications, 15000);
}

function checkScheduleNotifications() {
    const now = new Date();
    schedules.forEach(s => {
        if (s.completed) return;
        if (notifiedSchedules.has(s.id)) return;

        const startTime = new Date(s.start);
        const diff = startTime.getTime() - now.getTime();

        if (diff <= 0 && diff > -5 * 60 * 1000) {
            notifySchedule(s);
            notifiedSchedules.add(s.id);
        }
        if (diff > 0 && diff <= 60 * 1000) {
            notifyScheduleUpcoming(s, diff);
            notifiedSchedules.add(s.id + '_upcoming');
        }
    });
}

function notifySchedule(schedule) {
    const timeInfo = formatTimeDisplay(schedule.start, schedule.end);
    const message = `${schedule.title} 现在应该开始了！`;

    showNotificationPopup({
        title: '日程提醒',
        message,
        time: `${timeInfo.date} ${timeInfo.time}`,
        type: 'now',
        scheduleId: schedule.id,
    });

    if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification('MIMO TODO - 日程提醒', {
            body: message,
            tag: 'schedule_' + schedule.id,
            requireInteraction: true,
            silent: false,
        });
        n.onclick = () => { window.focus(); n.close(); };
    }

    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.3;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.stop(ctx.currentTime + 0.5);
    } catch {}
}

function notifyScheduleUpcoming(schedule, diffMs) {
    const minutes = Math.ceil(diffMs / 60000);
    const timeInfo = formatTimeDisplay(schedule.start, schedule.end);
    const message = `${schedule.title} 将在 ${minutes} 分钟后开始`;

    showNotificationPopup({
        title: '即将开始',
        message,
        time: `${timeInfo.date} ${timeInfo.time}`,
        type: 'upcoming',
        scheduleId: schedule.id,
    });

    if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification('MIMO TODO - 即将开始', {
            body: message,
            tag: 'upcoming_' + schedule.id,
            silent: false,
        });
        n.onclick = () => { window.focus(); n.close(); };
    }
}

function showNotificationPopup({ title, message, time, type, scheduleId }) {
    const container = document.getElementById('notificationContainer');
    const id = 'notif_' + Date.now();
    const isNow = type === 'now';

    const div = document.createElement('div');
    div.className = `notification-popup ${isNow ? 'notif-urgent' : 'notif-upcoming'}`;
    div.id = id;
    div.innerHTML = `
        <div class="notif-icon ${isNow ? 'notif-icon-urgent' : 'notif-icon-upcoming'}">
            ${isNow
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>'
            }
        </div>
        <div class="notif-body">
            <div class="notif-title">${escapeHtml(title)}</div>
            <div class="notif-message">${escapeHtml(message)}</div>
            <div class="notif-time">${escapeHtml(time)}</div>
        </div>
        <div class="notif-actions">
            <button class="notif-btn-primary" onclick="openDetailModal('${scheduleId}'); dismissNotification('${id}')">查看</button>
            <button class="notif-btn-dismiss" onclick="dismissNotification('${id}')">关闭</button>
        </div>
    `;

    container.appendChild(div);
    requestAnimationFrame(() => div.classList.add('show'));
    const timeout = isNow ? 15000 : 8000;
    setTimeout(() => dismissNotification(id), timeout);
}

function dismissNotification(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('show');
    el.classList.add('hide');
    setTimeout(() => el.remove(), 400);
}

// 加载日程后启动检查
const originalLoadSchedules = loadSchedules;
loadSchedules = async function() {
    await originalLoadSchedules();
    if (!notificationTimer) startNotificationChecker();
};

// ========================================
// 音乐播放器 - MP3 文件播放
// ========================================

let musicTracks = [];
let currentTrackIndex = 0;
let musicMode = 'loop';
let musicVolume = 0.6;
let isMuted = false;
let musicProgressTimer = null;
const audio = new Audio();

async function loadMusicTracks() {
    try {
        const res = await fetch('/api/music');
        musicTracks = await res.json();
        if (musicTracks.length > 0) {
            updateTrackDisplay();
        } else {
            document.getElementById('musicTitle').textContent = '暂无音乐';
            document.getElementById('musicArtist').textContent = '请放入 MP3 文件';
        }
    } catch (err) {
        console.error('加载音乐列表失败:', err);
    }
}

audio.addEventListener('ended', () => {
    if (musicMode === 'single') {
        audio.currentTime = 0;
        audio.play();
    } else {
        musicNext();
    }
});

audio.addEventListener('loadedmetadata', () => {
    document.getElementById('musicTimeTotal').textContent = formatMusicTime(audio.duration);
});

audio.volume = musicVolume;

function toggleMusic() {
    if (audio.paused) {
        startMusic();
    } else {
        pauseMusic();
    }
}

function startMusic() {
    if (musicTracks.length === 0) return;
    if (!audio.src && musicTracks.length > 0) {
        audio.src = musicTracks[currentTrackIndex].url;
    }
    audio.play();
    updateMusicUI();
    startProgressTimer();
}

function pauseMusic() {
    audio.pause();
    updateMusicUI();
    stopProgressTimer();
}

function musicNext() {
    if (musicTracks.length === 0) return;
    const wasPlaying = !audio.paused;
    if (wasPlaying) audio.pause();
    if (musicMode === 'shuffle') {
        let next;
        do { next = Math.floor(Math.random() * musicTracks.length); } while (next === currentTrackIndex && musicTracks.length > 1);
        currentTrackIndex = next;
    } else {
        currentTrackIndex = (currentTrackIndex + 1) % musicTracks.length;
    }
    audio.src = musicTracks[currentTrackIndex].url;
    audio.currentTime = 0;
    updateTrackDisplay();
    if (wasPlaying) audio.play();
}

function musicPrev() {
    if (musicTracks.length === 0) return;
    const wasPlaying = !audio.paused;
    if (wasPlaying) audio.pause();
    currentTrackIndex = (currentTrackIndex - 1 + musicTracks.length) % musicTracks.length;
    audio.src = musicTracks[currentTrackIndex].url;
    audio.currentTime = 0;
    updateTrackDisplay();
    if (wasPlaying) audio.play();
}

function toggleMusicMode() {
    const modes = ['loop', 'single', 'shuffle'];
    const idx = modes.indexOf(musicMode);
    musicMode = modes[(idx + 1) % modes.length];
    document.querySelectorAll('.music-player .mode-loop, .music-player .mode-single, .music-player .mode-shuffle').forEach(el => el.style.display = 'none');
    document.querySelector(`.music-player .mode-${musicMode}`).style.display = '';
    const labels = { loop: '列表循环', single: '单曲循环', shuffle: '随机播放' };
    showToast(labels[musicMode]);
}

function toggleMusicMute() {
    isMuted = !isMuted;
    audio.muted = isMuted;
    document.querySelector('.music-volume-btn .vol-on').style.display = isMuted ? 'none' : '';
    document.querySelector('.music-volume-btn .vol-off').style.display = isMuted ? '' : 'none';
}

function setMusicVolume(val) {
    musicVolume = val / 100;
    audio.volume = musicVolume;
    isMuted = false;
    audio.muted = false;
    document.querySelector('.music-volume-btn .vol-on').style.display = '';
    document.querySelector('.music-volume-btn .vol-off').style.display = 'none';
}

function updateMusicUI() {
    const playIcon = document.querySelector('#musicPlayBtn .play-icon');
    const pauseIcon = document.querySelector('#musicPlayBtn .pause-icon');
    if (!audio.paused) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = '';
    } else {
        playIcon.style.display = '';
        pauseIcon.style.display = 'none';
    }
}

function updateTrackDisplay() {
    if (musicTracks.length === 0) return;
    const track = musicTracks[currentTrackIndex];
    document.getElementById('musicTitle').textContent = track.name;
    document.getElementById('musicArtist').textContent = '图书馆自习';
    document.getElementById('musicTimeTotal').textContent = '--:--';
    document.getElementById('musicTimeCurrent').textContent = '0:00';
    document.getElementById('musicProgressFill').style.width = '0%';
}

function startProgressTimer() {
    stopProgressTimer();
    musicProgressTimer = setInterval(() => {
        if (audio.paused || !audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        document.getElementById('musicProgressFill').style.width = pct + '%';
        document.getElementById('musicTimeCurrent').textContent = formatMusicTime(audio.currentTime);
    }, 250);
}

function stopProgressTimer() {
    if (musicProgressTimer) { clearInterval(musicProgressTimer); musicProgressTimer = null; }
}

function formatMusicTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
}

document.addEventListener('DOMContentLoaded', () => {
    const bar = document.getElementById('musicProgressBar');
    if (bar) {
        bar.addEventListener('click', (e) => {
            if (!audio.duration) return;
            const rect = bar.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audio.currentTime = pct * audio.duration;
        });
    }
    loadMusicTracks();
});
