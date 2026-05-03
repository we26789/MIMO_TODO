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

async function apiCancel(id, reason) {
    const res = await fetch(`${API}/${id}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel_reason: reason })
    });
    return res.json();
}

async function apiRestore(id) {
    const res = await fetch(`${API}/${id}/restore`, { method: 'PATCH' });
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
    const date = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
    document.getElementById('currentTime').textContent = `${date} ${time}`;
}

// 页面切换
function switchPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`[data-page="${page}"]`).classList.add('active');
    const titles = { dashboard: '仪表盘', create: '新建日程', schedules: '查看日程', intent: '意图视图', energy: '能量视图', weather: '天气视图', weekly: '周报' };
    const breadcrumbs = { dashboard: '首页 / 仪表盘', create: '首页 / 新建日程', schedules: '首页 / 查看日程', intent: '首页 / 意图视图', energy: '首页 / 能量视图', weather: '首页 / 天气视图', weekly: '首页 / 周报' };
    document.getElementById('pageTitle').textContent = titles[page];
    document.getElementById('breadcrumb').textContent = breadcrumbs[page];
    if (page === 'dashboard') refreshDashboard();
    if (page === 'schedules') renderSchedules();
    if (page === 'intent') renderIntentView();
    if (page === 'energy') renderEnergyView();
    if (page === 'weather') renderWeatherView();
    if (page === 'weekly') renderWeeklyView();
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
    setPickerValue('scheduleStart', start);
    setPickerValue('scheduleEnd', end);
}

function setPickerValue(inputId, date) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const stored = formatDateTimeLocal(date);
    const display = `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日 ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    input.value = display;
    input.dataset.storedValue = stored;
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
    const start = document.getElementById('scheduleStart').dataset.storedValue || '';
    const end = document.getElementById('scheduleEnd').dataset.storedValue || '';
    const desc = document.getElementById('scheduleDesc').value.trim();
    const priority = document.querySelector('input[name="priority"]:checked').value;
    const urgency = document.querySelector('input[name="urgency"]:checked').value;
    const category = document.querySelector('input[name="category"]:checked').value;
    const context_type = document.querySelector('input[name="context_type"]:checked').value;

    if (!title || !start || !end) { showToast('请填写完整信息', 'error'); return false; }
    if (new Date(end) <= new Date(start)) { showToast('结束时间必须晚于开始时间', 'error'); return false; }

    const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    await apiPost({ id, title, description: desc, start, end, priority, urgency, category, context_type });

    document.getElementById('manualForm').reset();
    setDefaultFormValues();
    showToast('日程创建成功');
    await loadSchedules();
    return false;
}

// 智能排序评分
function getSmartScore(schedule, now) {
    const start = new Date(schedule.start);
    const end = new Date(schedule.end);
    const priorityVal = { high: 0, medium: 1, low: 2 }[schedule.priority] ?? 2;
    const urgencyVal = { critical: 0, urgent: 1, normal: 2 }[schedule.urgency] ?? 2;
    const isOngoing = start <= now && end >= now;
    const isPast = end < now;

    if (isOngoing) return 0;
    if (isPast) return 1e12 - end.getTime();
    return start.getTime() + priorityVal * 60000 + urgencyVal * 30000;
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
    if (currentFilter === 'completed') list = list.filter(s => s.completed && !s.cancel_reason);
    else if (currentFilter === 'pending') list = list.filter(s => !s.completed && !s.cancel_reason);
    else if (currentFilter === 'cancelled') list = list.filter(s => !!s.cancel_reason);

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

    const now = new Date();
    const incomplete = list.filter(s => !s.completed && !s.cancel_reason);
    const completed = list.filter(s => s.completed || s.cancel_reason);
    incomplete.sort((a, b) => getSmartScore(a, now) - getSmartScore(b, now));
    completed.sort((a, b) => getSmartScore(a, now) - getSmartScore(b, now));
    list = [...incomplete, ...completed];

    container.innerHTML = list.map(s => {
        const urgencyClass = s.urgency || 'normal';
        const timeInfo = formatTimeDisplay(s.start, s.end);
        const completedTime = s.completed && s.completed_at ? formatCompletedTime(s.completed_at) : '';
        const isCancelled = !!s.cancel_reason;
        return `
        <div class="schedule-item ${s.completed ? 'completed' : ''} ${isCancelled ? 'cancelled' : ''}" data-id="${s.id}" onclick="openDetailModal('${s.id}')" style="cursor:pointer">
            <div class="schedule-priority ${s.priority}"></div>
            <div class="schedule-info">
                <div class="schedule-title">${escapeHtml(s.title)}</div>
                <div class="schedule-desc">${escapeHtml(s.description || '暂无描述')}</div>
                <div class="schedule-meta">
                    <span class="meta-tag priority-tag-${s.priority}">${s.priority === 'high' ? '高优先级' : s.priority === 'medium' ? '中优先级' : '低优先级'}</span>
                    <span class="meta-tag urgency-tag-${urgencyClass}">${getUrgencyLabel(s.urgency)}</span>
                    ${isCancelled ? `<span class="meta-tag cancelled-tag">已取消</span>` : ''}
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
    setPickerValue('editStart', new Date(s.start));
    setPickerValue('editEnd', new Date(s.end));
    document.getElementById('editDesc').value = s.description || '';
    const pr = document.querySelector(`input[name="editPriority"][value="${s.priority}"]`);
    if (pr) pr.checked = true;
    const ur = document.querySelector(`input[name="editUrgency"][value="${s.urgency || 'normal'}"]`);
    if (ur) ur.checked = true;
    const cat = document.querySelector(`input[name="editCategory"][value="${s.category || 'work'}"]`);
    if (cat) cat.checked = true;
    const ctx = document.querySelector(`input[name="editContext"][value="${s.context_type || 'anywhere'}"]`);
    if (ctx) ctx.checked = true;
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
    const start = document.getElementById('editStart').dataset.storedValue || '';
    const end = document.getElementById('editEnd').dataset.storedValue || '';
    const desc = document.getElementById('editDesc').value.trim();
    const priority = document.querySelector('input[name="editPriority"]:checked').value;
    const urgency = document.querySelector('input[name="editUrgency"]:checked').value;
    const category = document.querySelector('input[name="editCategory"]:checked').value;
    const context_type = document.querySelector('input[name="editContext"]:checked').value;

    if (!title || !start || !end) { showToast('请填写完整信息', 'error'); return false; }
    if (new Date(end) <= new Date(start)) { showToast('结束时间必须晚于开始时间', 'error'); return false; }

    const s = schedules.find(x => x.id === id);
    await apiPut(id, { title, description: desc, start, end, priority, urgency, category, context_type, completed: s ? s.completed : false });
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
        <div class="search-dropdown-item ${s.completed ? 'completed' : ''} ${s.cancel_reason ? 'cancelled' : ''}" onclick="openDetailFromSearch('${s.id}')">
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
    const isCancelled = !!s.cancel_reason;
    if (isCancelled) {
        statusEl.innerHTML = '<span class="meta-tag cancelled-tag">已取消</span>';
    } else if (s.completed) {
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

    const cancelRow = document.getElementById('detailCancelRow');
    if (isCancelled) {
        cancelRow.style.display = '';
        document.getElementById('detailCancelReason').textContent = s.cancel_reason;
    } else {
        cancelRow.style.display = 'none';
    }

    // 更新取消/恢复按钮
    const cancelBtn = document.getElementById('detailCancelBtn');
    if (isCancelled) {
        cancelBtn.textContent = '恢复日程';
        cancelBtn.className = 'btn btn-primary';
        cancelBtn.onclick = () => restoreSchedule(id);
    } else {
        cancelBtn.textContent = '取消日程';
        cancelBtn.className = 'btn btn-danger';
        cancelBtn.onclick = () => cancelSchedule();
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

function cancelSchedule() {
    document.getElementById('cancelReasonInput').value = '';
    document.getElementById('cancelModal').classList.add('active');
}

function closeCancelModal() {
    document.getElementById('cancelModal').classList.remove('active');
}

async function confirmCancelSchedule() {
    if (!currentDetailId) return;
    const reason = document.getElementById('cancelReasonInput').value.trim();
    await apiCancel(currentDetailId, reason || '未填写原因');
    closeCancelModal();
    closeDetailModal();
    await loadSchedules();
    showToast('日程已取消');
}

async function restoreSchedule(id) {
    if (!confirm('确定恢复该日程？')) return;
    await apiRestore(id);
    closeDetailModal();
    await loadSchedules();
    showToast('日程已恢复');
}

// 点击模态框外部关闭
document.getElementById('detailModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDetailModal();
});
document.getElementById('cancelModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeCancelModal();
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
    return `完成于 ${d.getFullYear()}年${month}月${day}日 ${h}:${min}`;
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
        date = `${s.getFullYear()}年${s.getMonth() + 1}月${s.getDate()}日 ${weekdays[s.getDay()]}`;
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

function autoResizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}

function sendAiExample(btn) {
    const text = btn.textContent;
    const input = document.getElementById('aiInput');
    input.value = text;
    autoResizeTextarea(input);
    sendAiMessage();
}

async function sendAiMessage() {
    if (aiProcessing) return;
    const input = document.getElementById('aiInput');
    const message = input.value.trim();
    if (!message) return;

    aiProcessing = true;
    input.value = '';
    input.style.height = 'auto';
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
            signal: AbortSignal.timeout(90000),
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
        const msg = err.name === 'TimeoutError' ? '请求超时，请稍后重试' : '网络错误，请检查连接后重试';
        renderAiMessage('assistant', `<span class="ai-error">${msg}</span>`);
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
    let html = escapeHtml(text);
    // 有序列表
    html = html.replace(/(?:^|\n)((?:\d+\.\s+.+\n?)+)/g, (match, list) => {
        const items = list.trim().split('\n').map(line => `<li>${line.replace(/^\d+\.\s+/, '')}</li>`).join('');
        return `<ol style="margin:4px 0;padding-left:20px">${items}</ol>`;
    });
    // 无序列表
    html = html.replace(/(?:^|\n)((?:[-*]\s+.+\n?)+)/g, (match, list) => {
        const items = list.trim().split('\n').map(line => `<li>${line.replace(/^[-*]\s+/, '')}</li>`).join('');
        return `<ul style="margin:4px 0;padding-left:20px">${items}</ul>`;
    });
    // 加粗
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // 换行（避免列表后的多余换行）
    html = html.replace(/\n/g, '<br>');
    // 清理连续 <br> 在列表标签附近
    html = html.replace(/<\/(?:ol|ul)><br>/g, '</$1>');
    html = html.replace(/<br><(?:ol|ul)/g, '<$1');
    return html;
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
    // 初始化能量视图日期
    energySelectedDate = new Date();
});

// ========================================
// 视角视图 - 辅助函数
// ========================================
const CATEGORY_LABELS = { work: '工作', eating: '吃饭', exercise: '运动', study: '学习' };
const CATEGORY_COLORS = { work: '#ff8c32', eating: '#34d399', exercise: '#3b82f6', study: '#8b5cf6' };
const CONTEXT_LABELS = { computer: '电脑前', phone: '打电话', outdoor: '外出', meeting: '会议', anywhere: '无特定' };
const CONTEXT_ICONS = { computer: '💻', phone: '📞', outdoor: '🚶', meeting: '👥', anywhere: '🌍' };
const ENERGY_LABELS = { high: '高能量', medium: '中能量', low: '低能量' };

// 自定义模块 (从 localStorage 读取)
function getCustomModules() {
    try { return JSON.parse(localStorage.getItem('mimo_custom_modules') || '[]'); } catch { return []; }
}
function saveCustomModules(mods) {
    localStorage.setItem('mimo_custom_modules', JSON.stringify(mods));
}

// ========================================
// 意图视图
// ========================================
// 意图视图
// ========================================
function showAddModuleForm() { document.getElementById('addModuleForm').style.display = ''; }
function hideAddModuleForm() { document.getElementById('addModuleForm').style.display = 'none'; }

function addCustomModule() {
    const nameInput = document.getElementById('newModuleName');
    const colorInput = document.getElementById('newModuleColor');
    const name = nameInput.value.trim();
    if (!name) { showToast('请输入模块名称', 'error'); return; }
    const key = 'custom_' + Date.now().toString(36);
    const mods = getCustomModules();
    mods.push({ key, name, color: colorInput.value });
    saveCustomModules(mods);
    nameInput.value = '';
    hideAddModuleForm();
    renderIntentView();
    showToast('模块已添加');
}

function removeCustomModule(key) {
    if (!confirm('确定删除该模块？')) return;
    const mods = getCustomModules().filter(m => m.key !== key);
    saveCustomModules(mods);
    renderIntentView();
}

async function renderIntentView() {
    try {
        const res = await fetch('/api/schedules/stats');
        const stats = await res.json();
        const cats = stats.byCategory || [];
        const customMods = getCustomModules();
        const allCats = [...Object.keys(CATEGORY_LABELS), ...customMods.map(m => m.key)];

        // 合并自定义模块数据
        const allCatData = allCats.map(cat => {
            const existing = cats.find(c => c.category === cat);
            if (existing) return existing;
            // 自定义模块：从本地 schedules 计算
            const catSchedules = schedules.filter(s => s.category === cat);
            const totalMinutes = catSchedules.reduce((sum, s) => {
                return sum + (new Date(s.end) - new Date(s.start)) / 60000;
            }, 0);
            return { category: cat, count: catSchedules.length, totalMinutes };
        }).filter(c => c.count > 0 || CATEGORY_LABELS[c.category]);

        const totalMinutes = allCatData.reduce((sum, c) => sum + Number(c.totalMinutes || 0), 0);

        // 渲染 SVG 饼图
        const pieContainer = document.getElementById('intentPie');
        const legendContainer = document.getElementById('intentLegend');

        if (totalMinutes === 0) {
            pieContainer.innerHTML = '<div class="intent-bar-empty">暂无数据，请先创建日程</div>';
            legendContainer.innerHTML = '';
        } else {
            const size = 180;
            const cx = size / 2, cy = size / 2, r = 70;
            let cumAngle = -90; // 从顶部开始
            const slices = allCatData.filter(c => (c.totalMinutes || 0) > 0).map(c => {
                const pct = (c.totalMinutes || 0) / totalMinutes;
                const angle = pct * 360;
                const startAngle = cumAngle;
                cumAngle += angle;
                const endAngle = cumAngle;
                const largeArc = angle > 180 ? 1 : 0;
                const startRad = (startAngle * Math.PI) / 180;
                const endRad = (endAngle * Math.PI) / 180;
                const x1 = cx + r * Math.cos(startRad);
                const y1 = cy + r * Math.sin(startRad);
                const x2 = cx + r * Math.cos(endRad);
                const y2 = cy + r * Math.sin(endRad);
                const color = CATEGORY_COLORS[c.category] || customMods.find(m => m.key === c.category)?.color || '#666';
                return `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z" fill="${color}" opacity="0.85"><title>${CATEGORY_LABELS[c.category] || c.category}: ${(pct * 100).toFixed(1)}%</title></path>`;
            });
            pieContainer.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${slices.join('')}</svg>`;

            legendContainer.innerHTML = allCatData.filter(c => (c.totalMinutes || 0) > 0).map(c => {
                const pct = ((c.totalMinutes || 0) / totalMinutes * 100).toFixed(1);
                const color = CATEGORY_COLORS[c.category] || customMods.find(m => m.key === c.category)?.color || '#666';
                const hours = Math.floor((c.totalMinutes || 0) / 60);
                const mins = (c.totalMinutes || 0) % 60;
                const isCustom = customMods.some(m => m.key === c.category);
                return `<div class="intent-legend-item">
                    <span class="intent-legend-dot" style="background:${color}"></span>
                    <span>${CATEGORY_LABELS[c.category] || c.category} ${pct}% (${hours}h${mins}m)</span>
                    ${isCustom ? `<button class="intent-remove-btn" onclick="removeCustomModule('${c.category}')" title="删除模块">×</button>` : ''}
                </div>`;
            }).join('');
        }

        // 渲染分类卡片
        const container = document.getElementById('intentCategories');
        container.innerHTML = allCats.map(cat => {
            const catSchedules = schedules.filter(s => (s.category || 'work') === cat);
            const catData = allCatData.find(c => c.category === cat);
            const catMinutes = catData?.totalMinutes || 0;
            const hours = Math.floor(catMinutes / 60);
            const mins = catMinutes % 60;
            const color = CATEGORY_COLORS[cat] || customMods.find(m => m.key === cat)?.color || '#666';
            const isCustom = customMods.some(m => m.key === cat);
            if (catSchedules.length === 0 && !CATEGORY_LABELS[cat]) return '';
            return `
            <div class="card intent-category-card">
                <div class="card-header">
                    <h3><span class="intent-cat-dot" style="background:${color}"></span>${CATEGORY_LABELS[cat] || cat}</h3>
                    <span class="intent-cat-time">${hours}h ${mins}m</span>
                </div>
                <div class="card-body">
                    ${catSchedules.length === 0 ? '<div class="empty-hint">暂无日程</div>' :
                    catSchedules.map(s => {
                        const ti = formatTimeDisplay(s.start, s.end);
                        return `<div class="schedule-item" onclick="openDetailModal('${s.id}')" style="cursor:pointer">
                            <div class="schedule-priority ${s.priority}"></div>
                            <div class="schedule-info">
                                <div class="schedule-title">${escapeHtml(s.title)}</div>
                                <div class="schedule-desc">${ti.date} ${ti.time}</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        console.error('渲染意图视图失败:', err);
    }
}

// ========================================
// 能量视图
// ========================================
let energySelectedDate = new Date();

function energyPrevDay() {
    energySelectedDate.setDate(energySelectedDate.getDate() - 1);
    renderEnergyView();
}
function energyNextDay() {
    energySelectedDate.setDate(energySelectedDate.getDate() + 1);
    renderEnergyView();
}
function energyToday() {
    energySelectedDate = new Date();
    renderEnergyView();
}

function renderEnergyView() {
    const d = energySelectedDate;
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    document.getElementById('energyDateLabel').textContent =
        `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`;

    // 筛选当天日程
    const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);
    const daySchedules = schedules.filter(s => {
        const st = new Date(s.start);
        return st >= dayStart && st <= dayEnd;
    });

    // 时段分组: 早晨(6-9) 上午(9-12) 下午(12-18) 晚间(18-22) 深夜(22-6)
    const periods = [
        { name: '早晨', key: 'morning', hours: [6, 7, 8], color: '#ff8c32' },
        { name: '上午', key: 'am', hours: [9, 10, 11], color: '#3b82f6' },
        { name: '下午', key: 'pm', hours: [12, 13, 14, 15, 16, 17], color: '#34d399' },
        { name: '晚间', key: 'evening', hours: [18, 19, 20, 21], color: '#8b5cf6' },
        { name: '深夜', key: 'night', hours: [22, 23, 0, 1, 2, 3, 4, 5], color: '#6b7280' },
    ];

    const periodCounts = periods.map(p => ({
        ...p,
        count: daySchedules.filter(s => p.hours.includes(new Date(s.start).getHours())).length,
    }));
    const totalCount = daySchedules.length || 1;

    // SVG 饼图
    const pieContainer = document.getElementById('energyPie');
    const legendContainer = document.getElementById('energyPieLegend');

    if (daySchedules.length === 0) {
        pieContainer.innerHTML = '<div class="intent-bar-empty">当日暂无日程</div>';
        legendContainer.innerHTML = '';
    } else {
        const size = 200, cx = 100, cy = 100, r = 80;
        let cumAngle = -90;
        const activePeriods = periodCounts.filter(p => p.count > 0);
        const slices = activePeriods.map((p, i) => {
            const pct = p.count / totalCount;
            const angle = pct * 360;
            const startAngle = cumAngle;
            cumAngle += angle;
            const endAngle = cumAngle;
            const largeArc = angle > 180 ? 1 : 0;
            const sr = (startAngle * Math.PI) / 180;
            const er = (endAngle * Math.PI) / 180;
            return `<path data-pi="${i}" d="M${cx},${cy} L${cx + r * Math.cos(sr)},${cy + r * Math.sin(sr)} A${r},${r} 0 ${largeArc},1 ${cx + r * Math.cos(er)},${cy + r * Math.sin(er)} Z" fill="${p.color}" opacity="0.85"><title>${p.name}: ${p.count}个日程</title></path>`;
        });
        pieContainer.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${slices.join('')}</svg>`;
        legendContainer.innerHTML = activePeriods.map(p =>
            `<div class="intent-legend-item"><span class="intent-legend-dot" style="background:${p.color}"></span>${p.name} ${p.count}个</div>`
        ).join('');

        // 饼图悬停交互：显示对应时段的日程
        const detailEl = document.getElementById('energyPieDetail');
        const svgPaths = pieContainer.querySelectorAll('svg path');
        svgPaths.forEach(pathEl => {
            pathEl.addEventListener('mouseenter', () => {
                const idx = parseInt(pathEl.dataset.pi);
                const period = activePeriods[idx];
                // 淡化其他扇区
                svgPaths.forEach(p => { if (p !== pathEl) p.classList.add('dimmed'); });
                // 显示该时段日程详情
                const periodSchedules = daySchedules.filter(s => period.hours.includes(new Date(s.start).getHours()));
                detailEl.innerHTML = `<div class="epd-title"><span class="epd-dot" style="background:${period.color}"></span>${period.name} (${period.count}个日程)</div>` +
                    periodSchedules.sort((a,b) => new Date(a.start) - new Date(b.start)).map(s => {
                        const sh = new Date(s.start), eh = new Date(s.end);
                        const st = `${String(sh.getHours()).padStart(2,'0')}:${String(sh.getMinutes()).padStart(2,'0')}`;
                        const et = `${String(eh.getHours()).padStart(2,'0')}:${String(eh.getMinutes()).padStart(2,'0')}`;
                        const catColor = CATEGORY_COLORS[s.category] || '#666';
                        return `<div class="epd-item"><span>${escapeHtml(s.title)} <span style="color:${catColor};font-size:11px">${CATEGORY_LABELS[s.category] || s.category}</span></span><span class="epd-time">${st}-${et}</span></div>`;
                    }).join('');
                detailEl.classList.add('active');
            });
            pathEl.addEventListener('mouseleave', () => {
                svgPaths.forEach(p => p.classList.remove('dimmed'));
                detailEl.classList.remove('active');
            });
        });
    }

    // 纵向时间线
    const timeline = document.getElementById('energyTimelineV');
    const currentHour = new Date().getHours();
    const isToday = d.toDateString() === new Date().toDateString();

    let timelineHtml = '';
    for (let h = 0; h < 24; h++) {
        const hourSchedules = daySchedules.filter(s => new Date(s.start).getHours() === h);
        const isCurrent = isToday && h === currentHour;
        timelineHtml += `<div class="energy-tl-row ${isCurrent ? 'current' : ''}">
            <div class="energy-tl-hour">${String(h).padStart(2, '0')}:00</div>
            <div class="energy-tl-dot ${isCurrent ? 'current' : ''}"></div>
            <div class="energy-tl-content">
                ${hourSchedules.map(s => {
                    const sh = new Date(s.start);
                    const eh = new Date(s.end);
                    const st = `${String(sh.getHours()).padStart(2, '0')}:${String(sh.getMinutes()).padStart(2, '0')}`;
                    const et = `${String(eh.getHours()).padStart(2, '0')}:${String(eh.getMinutes()).padStart(2, '0')}`;
                    const catColor = CATEGORY_COLORS[s.category] || '#666';
                    return `<div class="energy-tl-block" style="border-left-color:${catColor}" onclick="openDetailModal('${s.id}')" title="${escapeHtml(s.title)}">
                        <span class="energy-tl-block-time">${st}-${et}</span>
                        <span class="energy-tl-block-title">${escapeHtml(s.title)}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    }
    timeline.innerHTML = timelineHtml;
}

// ========================================
// 天气视图
// ========================================
let currentWeather = null;

async function renderWeatherView() {
    const city = localStorage.getItem('mimo_weather_city') || 'Beijing';
    document.getElementById('weatherCityInput').value = city;

    try {
        const res = await fetch(`/api/weather/forecast?city=${encodeURIComponent(city)}&days=3`);
        const data = await res.json();

        if (data.error) {
            document.getElementById('weatherTodayCard').querySelector('.card-body').innerHTML = `<div class="weather-error">${data.error}</div>`;
            return;
        }

        const forecast = data.forecast || [];
        const today = forecast[0];

        // 今日天气大卡片
        const todayCard = document.getElementById('weatherTodayCard');
        if (today) {
            currentWeather = today;
            todayCard.querySelector('.card-body').innerHTML = `
            <div class="weather-main ${today.isBadWeather ? 'bad' : 'good'}">
                <div class="weather-icon-large">${today.icon}</div>
                <div class="weather-info">
                    <div class="weather-temp">${today.temp}°C</div>
                    <div class="weather-desc">${today.condition}</div>
                    <div class="weather-city-name">${data.city || city}</div>
                    <div class="weather-hilo">↑${today.maxTemp}° ↓${today.minTemp}°</div>
                </div>
                ${today.isBadWeather ? '<div class="weather-badge-bad">⚠️ 恶劣天气</div>' : '<div class="weather-badge-good">✅ 适合户外</div>'}
            </div>`;
        }

        // 未来几天天气
        const forecastContainer = document.getElementById('weatherForecast');
        forecastContainer.innerHTML = forecast.map(day => `
            <div class="card weather-forecast-card ${day.isBadWeather ? 'bad' : ''}">
                <div class="card-body">
                    <div class="wf-label">${day.label}</div>
                    <div class="wf-icon">${day.icon}</div>
                    <div class="wf-temp">${day.temp}°C</div>
                    <div class="wf-desc">${day.condition}</div>
                    <div class="wf-hilo">↑${day.maxTemp}° ↓${day.minTemp}°</div>
                    ${day.isBadWeather ? '<div class="wf-warn">⚠️</div>' : ''}
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('加载天气失败:', err);
        document.getElementById('weatherTodayCard').querySelector('.card-body').innerHTML = '<div class="weather-error">天气加载失败</div>';
    }
}

function changeWeatherCity() {
    const city = document.getElementById('weatherCityInput').value.trim();
    if (!city) { showToast('请输入城市名', 'error'); return; }
    localStorage.setItem('mimo_weather_city', city);
    renderWeatherView();
    showToast('已切换到 ' + city);
}

// ========================================
// 周报
// ========================================
let weeklyStartDate = getMonday(new Date());

function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
    date.setHours(0, 0, 0, 0);
    return date;
}

function weeklyPrevWeek() {
    weeklyStartDate.setDate(weeklyStartDate.getDate() - 7);
    renderWeeklyView();
}

function weeklyNextWeek() {
    weeklyStartDate.setDate(weeklyStartDate.getDate() + 7);
    renderWeeklyView();
}

function weeklyThisWeek() {
    weeklyStartDate = getMonday(new Date());
    renderWeeklyView();
}

async function renderWeeklyView() {
    const d = weeklyStartDate;
    const weekEnd = new Date(d);
    weekEnd.setDate(d.getDate() + 6);
    document.getElementById('weeklyDateLabel').textContent =
        `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 - ${weekEnd.getFullYear()}年${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日`;

    try {
        const startDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const res = await fetch(`/api/schedules/weekly-report?startDate=${startDateStr}`);
        const data = await res.json();

        // 概览卡片
        const overviewEl = document.getElementById('weeklyOverview');
        const hours = Math.floor((data.totalMinutes || 0) / 60);
        const mins = (data.totalMinutes || 0) % 60;
        const total = data.totalSchedules || 0;
        const completed = data.completedCount || 0;
        const cancelled = data.cancelledCount || 0;
        const completionRate = total > 0 ? (completed / total * 100).toFixed(0) : 0;
        overviewEl.innerHTML = `
            <div class="card weekly-stat-card">
                <div class="weekly-stat-value">${total}</div>
                <div class="weekly-stat-label">总日程</div>
            </div>
            <div class="card weekly-stat-card">
                <div class="weekly-stat-value" style="color:var(--green)">${completed}</div>
                <div class="weekly-stat-label">已完成 ${completionRate}%</div>
            </div>
            <div class="card weekly-stat-card">
                <div class="weekly-stat-value" style="color:#ef4444">${cancelled}</div>
                <div class="weekly-stat-label">已取消</div>
            </div>
            <div class="card weekly-stat-card">
                <div class="weekly-stat-value" style="color:var(--orange)">${hours}h${mins}m</div>
                <div class="weekly-stat-label">总时长</div>
            </div>`;

        // 分类饼图
        const catColors = { work: '#ff8c32', eating: '#34d399', exercise: '#3b82f6', study: '#8b5cf6' };
        const catLabels = { work: '工作', eating: '吃饭', exercise: '运动', study: '学习' };
        const pieData = data.byCategory.filter(c => c.totalMinutes > 0);
        const pieTotal = pieData.reduce((s, c) => s + Number(c.totalMinutes || 0), 0) || 1;
        const pieContainer = document.getElementById('weeklyPie');
        const legendContainer = document.getElementById('weeklyPieLegend');

        if (pieData.length === 0) {
            pieContainer.innerHTML = '<div class="intent-bar-empty">本周暂无数据</div>';
            legendContainer.innerHTML = '';
        } else {
            const size = 180, cx = 90, cy = 90, r = 70;
            let cumAngle = -90;
            const slices = pieData.map(c => {
                const pct = c.totalMinutes / pieTotal;
                const angle = pct * 360;
                const startAngle = cumAngle;
                cumAngle += angle;
                const endAngle = cumAngle;
                const largeArc = angle > 180 ? 1 : 0;
                const sr = (startAngle * Math.PI) / 180;
                const er = (endAngle * Math.PI) / 180;
                const color = catColors[c.category] || '#666';
                return `<path d="M${cx},${cy} L${cx + r * Math.cos(sr)},${cy + r * Math.sin(sr)} A${r},${r} 0 ${largeArc},1 ${cx + r * Math.cos(er)},${cy + r * Math.sin(er)} Z" fill="${color}" opacity="0.85"><title>${catLabels[c.category] || c.category}: ${pct.toFixed(1) * 100}%</title></path>`;
            });
            pieContainer.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${slices.join('')}</svg>`;
            legendContainer.innerHTML = pieData.map(c => {
                const pct = (c.totalMinutes / pieTotal * 100).toFixed(1);
                const h = Math.floor(c.totalMinutes / 60);
                const m = c.totalMinutes % 60;
                const color = catColors[c.category] || '#666';
                return `<div class="intent-legend-item"><span class="intent-legend-dot" style="background:${color}"></span>${catLabels[c.category] || c.category} ${pct}% (${h}h${m}m)</div>`;
            }).join('');
        }

        // 每日时间横条图
        const dayBarsEl = document.getElementById('weeklyDayBars');
        const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const maxDayMinutes = Math.max(...data.byDay.map(d => d.totalMinutes || 0), 1);
        // 补全7天数据
        const fullDays = dayLabels.map((label, i) => {
            const found = data.byDay.find(d => d.dayLabel === label);
            return { dayLabel: label, totalMinutes: found ? (found.totalMinutes || 0) : 0, count: found ? found.count : 0 };
        });
        dayBarsEl.innerHTML = fullDays.map(d => {
            const pct = (d.totalMinutes / maxDayMinutes * 100).toFixed(0);
            const h = Math.floor(d.totalMinutes / 60);
            const m = d.totalMinutes % 60;
            return `<div class="weekly-day-bar-row">
                <span class="weekly-day-label">${d.dayLabel}</span>
                <div class="weekly-day-bar"><div class="weekly-day-bar-fill" style="width:${pct}%"></div></div>
                <span class="weekly-day-value">${d.totalMinutes > 0 ? h + 'h' + m + 'm' : '-'}</span>
            </div>`;
        }).join('');

        // 精力等级
        const energyEl = document.getElementById('weeklyEnergy');
        const energyLabels = { high: '高精力', medium: '中精力', low: '低精力' };
        const energyColors = { high: '#34d399', medium: '#ff8c32', low: '#6b7280' };
        const energyTotal = data.byEnergy.reduce((s, e) => s + Number(e.count || 0), 0) || 1;
        energyEl.innerHTML = `<div class="weekly-sub-title">精力等级分布</div>` +
            data.byEnergy.map(e => {
                const pct = (e.count / energyTotal * 100).toFixed(0);
                return `<div class="weekly-dist-row">
                    <span class="weekly-dist-label"><span class="weekly-dist-dot" style="background:${energyColors[e.energy_level] || '#666'}"></span>${energyLabels[e.energy_level] || e.energy_level}</span>
                    <div class="weekly-dist-bar"><div class="weekly-dist-bar-fill" style="width:${pct}%;background:${energyColors[e.energy_level] || '#666'}"></div></div>
                    <span class="weekly-dist-value">${e.count}个 (${pct}%)</span>
                </div>`;
            }).join('');

        // 时段分布
        const periodEl = document.getElementById('weeklyPeriod');
        const periodLabels = { morning: '早晨 6-9', am: '上午 9-12', pm: '下午 12-18', evening: '晚间 18-22', night: '深夜 22-6' };
        const periodColors = { morning: '#ff8c32', am: '#3b82f6', pm: '#34d399', evening: '#8b5cf6', night: '#6b7280' };
        const periodTotal = data.byPeriod.reduce((s, p) => s + Number(p.count || 0), 0) || 1;
        periodEl.innerHTML = `<div class="weekly-sub-title">时段分布</div>` +
            data.byPeriod.map(p => {
                const pct = (p.count / periodTotal * 100).toFixed(0);
                return `<div class="weekly-dist-row">
                    <span class="weekly-dist-label"><span class="weekly-dist-dot" style="background:${periodColors[p.period] || '#666'}"></span>${periodLabels[p.period] || p.period}</span>
                    <div class="weekly-dist-bar"><div class="weekly-dist-bar-fill" style="width:${pct}%;background:${periodColors[p.period] || '#666'}"></div></div>
                    <span class="weekly-dist-value">${p.count}个 (${pct}%)</span>
                </div>`;
            }).join('');

        // 24小时分布柱状图
        const hourlyEl = document.getElementById('weeklyHourly');
        const maxHourly = Math.max(...data.hourlyDistribution, 1);
        hourlyEl.innerHTML = `<div class="weekly-hourly-chart">` +
            data.hourlyDistribution.map((count, h) => {
                const pct = (count / maxHourly * 100).toFixed(0);
                return `<div class="weekly-hourly-col">
                    <div class="weekly-hourly-bar" style="height:${pct}%"></div>
                    <div class="weekly-hourly-label">${h}</div>
                </div>`;
            }).join('') + `</div>`;

        // 智能建议
        const adviceEl = document.getElementById('weeklyAdvice');
        adviceEl.innerHTML = generateWeeklyAdvice(data).map(a =>
            `<div class="weekly-advice-item">
                <span class="weekly-advice-icon">${a.icon}</span>
                <div class="weekly-advice-content">
                    <div class="weekly-advice-title">${a.title}</div>
                    <div class="weekly-advice-desc">${a.desc}</div>
                </div>
            </div>`
        ).join('');

    } catch (err) {
        console.error('加载周报失败:', err);
    }
}

function generateWeeklyAdvice(data) {
    const advice = [];
    const total = data.totalSchedules || 0;
    const completed = data.completedCount || 0;
    const cancelled = data.cancelledCount || 0;
    const totalMin = data.totalMinutes || 0;

    // 完成率分析
    if (total > 0) {
        const rate = completed / total;
        if (rate >= 0.8) {
            advice.push({ icon: '✅', title: '完成率优秀', desc: `本周完成率 ${(rate * 100).toFixed(0)}%，表现出色！保持高效执行力，适当挑战更高目标。` });
        } else if (rate >= 0.6) {
            advice.push({ icon: '💡', title: '完成率尚可', desc: `本周完成率 ${(rate * 100).toFixed(0)}%。建议将大任务拆分为更小的子任务，降低完成门槛，逐步提升执行力。` });
        } else if (total > 0) {
            advice.push({ icon: '⚠️', title: '完成率偏低', desc: `本周完成率仅 ${(rate * 100).toFixed(0)}%。建议重新评估任务量，避免过度安排。可使用番茄工作法提高专注度。` });
        }
    }

    // 取消率分析
    if (total > 0 && cancelled > 0) {
        const cancelRate = cancelled / total;
        if (cancelRate > 0.15) {
            advice.push({ icon: '📋', title: '取消率较高', desc: `本周取消了 ${cancelled} 个日程 (${(cancelRate * 100).toFixed(0)}%)。建议提前预留缓冲时间，减少临时变动对计划的影响。` });
        }
    }

    // 时间分配分析
    const workCat = data.byCategory.find(c => c.category === 'work');
    const studyCat = data.byCategory.find(c => c.category === 'study');
    const exerciseCat = data.byCategory.find(c => c.category === 'exercise');
    const workMin = workCat ? workCat.totalMinutes : 0;
    const studyMin = studyCat ? studyCat.totalMinutes : 0;
    const exerciseMin = exerciseCat ? exerciseCat.totalMinutes : 0;

    if (totalMin > 0 && workMin / totalMin > 0.65) {
        advice.push({ icon: '⚖️', title: '工作占比过高', desc: `工作时间占总时长 ${(workMin / totalMin * 100).toFixed(0)}%。长期高强度工作易导致倦怠，建议适当增加学习和运动时间，保持身心健康平衡。` });
    }

    if (totalMin > 0 && studyMin / totalMin < 0.1 && studyMin === 0) {
        advice.push({ icon: '📚', title: '建议增加学习', desc: '本周没有学习安排。建议每周至少安排 2-3 次学习时间，持续提升个人能力。即使每天 30 分钟也能带来显著进步。' });
    }

    // 运动频率
    if (exerciseMin === 0 && total > 0) {
        advice.push({ icon: '🏃', title: '建议增加运动', desc: '本周没有运动安排。研究表明每周 150 分钟中等强度运动可显著提升精力和工作效率。建议安排散步、跑步或健身。' });
    } else if (exerciseMin > 0 && exerciseMin < 90) {
        advice.push({ icon: '🏃', title: '运动量偏少', desc: `本周运动总时长 ${exerciseMin} 分钟，低于推荐的每周 150 分钟。适当增加运动频率有助于提升精力水平和工作效率。` });
    }

    // 深夜任务分析
    const nightPeriod = data.byPeriod.find(p => p.period === 'night');
    if (nightPeriod && nightPeriod.count > 3) {
        advice.push({ icon: '🌙', title: '深夜安排较多', desc: `本周有 ${nightPeriod.count} 个深夜任务。频繁熬夜会影响次日精力和长期健康。建议将非紧急任务调整到白天，保证充足睡眠。` });
    }

    // 精力匹配分析
    const highEnergy = data.byEnergy.find(e => e.energy_level === 'high');
    const morningPeriod = data.byPeriod.find(p => p.period === 'morning');
    if (highEnergy && morningPeriod && highEnergy.count > morningPeriod.count * 2) {
        advice.push({ icon: '⚡', title: '精力利用建议', desc: '高精力任务较多但早晨安排较少。建议将重要、高认知负荷的任务安排在上午 (9-12 点)，这是大多数人的精力高峰期。' });
    }

    // 默认建议
    if (advice.length === 0) {
        if (total === 0) {
            advice.push({ icon: '📝', title: '开始记录', desc: '本周还没有日程记录。建议创建一些日程来跟踪你的时间分配，周报将为你提供更有价值的分析。' });
        } else {
            advice.push({ icon: '👍', title: '整体表现良好', desc: '本周时间分配较为均衡，继续保持！定期查看周报可以帮助你持续优化时间管理策略。' });
        }
    }

    return advice;
}

async function downloadWeeklyReport() {
    const d = weeklyStartDate;
    const startDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    try {
        const res = await fetch(`/api/schedules/weekly-export?startDate=${startDateStr}`);
        if (!res.ok) throw new Error('下载失败');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `周报-${startDateStr}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('周报已下载');
    } catch (err) {
        showToast('下载失败: ' + err.message, 'error');
    }
}

// ========================================
// 日期时间选择器
// ========================================
let dtPickerTarget = null; // 目标 input 元素
let dtPickerDate = null;   // 选中的 Date 对象
let dtPickerHour = 9;
let dtPickerMinute = 0;

function openDateTimePicker(targetId) {
    const input = document.getElementById(targetId);
    if (!input) return;
    dtPickerTarget = input;

    // 解析已有值
    const stored = input.dataset.storedValue;
    if (stored) {
        const d = new Date(stored);
        dtPickerDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        dtPickerHour = d.getHours();
        dtPickerMinute = d.getMinutes();
    } else {
        const now = new Date();
        dtPickerDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dtPickerHour = now.getHours();
        dtPickerMinute = Math.ceil(now.getMinutes() / 5) * 5;
        if (dtPickerMinute >= 60) dtPickerMinute = 0;
    }

    dtPickerRenderCalendar();
    dtPickerRenderWheels();
    document.getElementById('dtPickerPopup').classList.add('active');
}

function closeDateTimePicker(confirm) {
    document.getElementById('dtPickerPopup').classList.remove('active');
    if (!confirm || !dtPickerTarget) return;

    const d = dtPickerDate;
    const h = dtPickerHour;
    const m = dtPickerMinute;
    const stored = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    const display = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;

    dtPickerTarget.value = display;
    dtPickerTarget.dataset.storedValue = stored;
    dtPickerTarget = null;
}

function dtPickerRenderCalendar() {
    const d = dtPickerDate;
    const year = d.getFullYear();
    const month = d.getMonth();

    document.getElementById('dtCalMonthLabel').textContent = `${year}年${month + 1}月`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    const container = document.getElementById('dtCalDays');
    let html = '';

    // 上月补位
    for (let i = firstDay - 1; i >= 0; i--) {
        html += `<button class="dt-cal-day other-month" data-day="${daysInPrev - i}" onclick="dtPickerSelectDay(${daysInPrev - i}, true)">${daysInPrev - i}</button>`;
    }

    // 本月
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = isCurrentMonth && day === today.getDate();
        const isSelected = day === d.getDate();
        html += `<button class="dt-cal-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}" data-day="${day}" onclick="dtPickerSelectDay(${day}, false)">${day}</button>`;
    }

    // 下月补位
    const totalCells = firstDay + daysInMonth;
    const remaining = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
        html += `<button class="dt-cal-day other-month" data-day="${i}" onclick="dtPickerSelectDay(${i}, true)">${i}</button>`;
    }

    container.innerHTML = html;
}

function dtPickerSelectDay(day, isOther) {
    if (isOther) return;
    dtPickerDate = new Date(dtPickerDate.getFullYear(), dtPickerDate.getMonth(), day);
    dtPickerRenderCalendar();
}

function dtPickerNavMonth(offset) {
    dtPickerDate = new Date(dtPickerDate.getFullYear(), dtPickerDate.getMonth() + offset, 1);
    dtPickerRenderCalendar();
}

function dtPickerRenderWheels() {
    const hourWheel = document.getElementById('dtHourWheel');
    const minuteWheel = document.getElementById('dtMinuteWheel');

    // 小时选项
    let hHtml = '';
    for (let h = 0; h < 24; h++) {
        hHtml += `<button class="dt-time-option${h === dtPickerHour ? ' selected' : ''}" data-value="${h}" onclick="dtPickerSelectHour(${h})">${String(h).padStart(2, '0')}</button>`;
    }
    hourWheel.innerHTML = hHtml;

    // 分钟选项（5分钟步进）
    let mHtml = '';
    for (let m = 0; m < 60; m += 5) {
        mHtml += `<button class="dt-time-option${m === dtPickerMinute ? ' selected' : ''}" data-value="${m}" onclick="dtPickerSelectMinute(${m})">${String(m).padStart(2, '0')}</button>`;
    }
    minuteWheel.innerHTML = mHtml;

    // 滚动到选中项
    requestAnimationFrame(() => {
        dtPickerScrollToSelected(hourWheel, dtPickerHour);
        dtPickerScrollToSelected(minuteWheel, dtPickerMinute);
    });
}

function dtPickerSelectHour(h) {
    dtPickerHour = h;
    document.querySelectorAll('#dtHourWheel .dt-time-option').forEach(el => {
        el.classList.toggle('selected', parseInt(el.dataset.value) === h);
    });
    dtPickerScrollToSelected(document.getElementById('dtHourWheel'), h);
}

function dtPickerSelectMinute(m) {
    dtPickerMinute = m;
    document.querySelectorAll('#dtMinuteWheel .dt-time-option').forEach(el => {
        el.classList.toggle('selected', parseInt(el.dataset.value) === m);
    });
    dtPickerScrollToSelected(document.getElementById('dtMinuteWheel'), m);
}

function dtPickerScrollToSelected(wheel, value) {
    const options = wheel.querySelectorAll('.dt-time-option');
    options.forEach(opt => {
        if (parseInt(opt.dataset.value) === value) {
            opt.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    });
}

// 绑定日期时间输入框点击事件
document.addEventListener('click', (e) => {
    const pickerInput = e.target.closest('.dt-picker-input');
    if (pickerInput) {
        openDateTimePicker(pickerInput.id);
    }
});

// Escape 关闭选择器
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const popup = document.getElementById('dtPickerPopup');
        if (popup && popup.classList.contains('active')) {
            closeDateTimePicker(false);
        }
    }
});
