/* ========================================
   MIMO TODO - 智能日程管理
   应用逻辑
   ======================================== */

// ========================================
// 粒子系统
// ========================================
class ParticleSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.connections = [];
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
        return {
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            radius: Math.random() * 1.5 + 0.5,
            opacity: Math.random() * 0.5 + 0.1,
        };
    }

    bindEvents() {
        window.addEventListener('resize', () => {
            this.resize();
            this.init();
        });

        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });

        window.addEventListener('mouseout', () => {
            this.mouse.x = null;
            this.mouse.y = null;
        });
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
            this.ctx.fillStyle = `rgba(56, 189, 248, ${p.opacity})`;
            this.ctx.fill();

            for (let j = i + 1; j < this.particles.length; j++) {
                const p2 = this.particles[j];
                const dx = p.x - p2.x;
                const dy = p.y - p2.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 120) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.strokeStyle = `rgba(56, 189, 248, ${0.08 * (1 - dist / 120)})`;
                    this.ctx.lineWidth = 0.5;
                    this.ctx.stroke();
                }
            }
        });

        requestAnimationFrame(() => this.animate());
    }
}

// ========================================
// 数据管理
// ========================================
class ScheduleManager {
    constructor() {
        this.schedules = this.load();
    }

    load() {
        try {
            const data = localStorage.getItem('mimo_schedules');
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }

    save() {
        localStorage.setItem('mimo_schedules', JSON.stringify(this.schedules));
    }

    add(schedule) {
        schedule.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        schedule.createdAt = new Date().toISOString();
        schedule.completed = false;
        this.schedules.unshift(schedule);
        this.save();
        return schedule;
    }

    update(id, updates) {
        const index = this.schedules.findIndex(s => s.id === id);
        if (index !== -1) {
            this.schedules[index] = { ...this.schedules[index], ...updates };
            this.save();
            return this.schedules[index];
        }
        return null;
    }

    delete(id) {
        this.schedules = this.schedules.filter(s => s.id !== id);
        this.save();
    }

    toggleComplete(id) {
        const schedule = this.schedules.find(s => s.id === id);
        if (schedule) {
            schedule.completed = !schedule.completed;
            this.save();
        }
    }

    getAll() {
        return this.schedules;
    }

    getByStatus(status) {
        if (status === 'all') return this.schedules;
        if (status === 'completed') return this.schedules.filter(s => s.completed);
        return this.schedules.filter(s => !s.completed);
    }

    search(query) {
        const q = query.toLowerCase();
        return this.schedules.filter(s =>
            s.title.toLowerCase().includes(q) ||
            (s.description && s.description.toLowerCase().includes(q))
        );
    }

    getToday() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        return this.schedules.filter(s => {
            const start = new Date(s.start);
            return start >= today && start < tomorrow;
        });
    }

    getStats() {
        const all = this.schedules;
        const today = this.getToday();
        const completed = all.filter(s => s.completed);
        const pending = all.filter(s => !s.completed);

        return {
            total: all.length,
            today: today.length,
            completed: completed.length,
            pending: pending.length,
        };
    }
}

// ========================================
// 应用主逻辑
// ========================================
const manager = new ScheduleManager();
let currentFilter = 'all';
let searchQuery = '';

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    new ParticleSystem(document.getElementById('particleCanvas'));
    updateClock();
    setInterval(updateClock, 1000);
    refreshDashboard();
    renderSchedules();
    setDefaultFormValues();
});

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

    const titles = {
        dashboard: '仪表盘',
        create: '新建日程',
        schedules: '查看日程',
    };
    const breadcrumbs = {
        dashboard: '首页 / 仪表盘',
        create: '首页 / 新建日程',
        schedules: '首页 / 查看日程',
    };

    document.getElementById('pageTitle').textContent = titles[page];
    document.getElementById('breadcrumb').textContent = breadcrumbs[page];

    if (page === 'dashboard') refreshDashboard();
    if (page === 'schedules') renderSchedules();
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

// 设置默认表单值（整点逻辑：开始=当前整点，结束=当前整点+2小时）
function setDefaultFormValues() {
    const now = new Date();
    const start = new Date(now);
    start.setMinutes(0, 0, 0);
    // 如果当前分钟 > 0，开始时间就是当前整点；否则也是当前整点
    // 如果当前整点已经过去，开始时间就是当前整点（今天）

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
    const stats = manager.getStats();
    document.getElementById('totalSchedules').textContent = stats.total;
    document.getElementById('todaySchedules').textContent = stats.today;
    document.getElementById('completedSchedules').textContent = stats.completed;
    document.getElementById('pendingSchedules').textContent = stats.pending;

    const todayList = document.getElementById('todayScheduleList');
    const todaySchedules = manager.getToday();

    if (todaySchedules.length === 0) {
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
        todayList.innerHTML = todaySchedules.slice(0, 5).map(s => {
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
function handleManualSubmit(e) {
    e.preventDefault();

    const title = document.getElementById('scheduleTitle').value.trim();
    const start = document.getElementById('scheduleStart').value;
    const end = document.getElementById('scheduleEnd').value;
    const desc = document.getElementById('scheduleDesc').value.trim();
    const priority = document.querySelector('input[name="priority"]:checked').value;
    const urgency = document.querySelector('input[name="urgency"]:checked').value;

    if (!title || !start || !end) {
        showToast('请填写完整信息', 'error');
        return false;
    }

    if (new Date(end) <= new Date(start)) {
        showToast('结束时间必须晚于开始时间', 'error');
        return false;
    }

    manager.add({ title, start, end, description: desc, priority, urgency });

    document.getElementById('manualForm').reset();
    setDefaultFormValues();
    showToast('日程创建成功');
    refreshDashboard();
    return false;
}

// 智能排序评分：综合 时间紧迫度 + 优先级 + 紧急程度
function getSmartScore(schedule) {
    const now = new Date();
    const start = new Date(schedule.start);
    const end = new Date(schedule.end);

    // 时间紧迫度评分 (0-100)：越临近/已过开始时间分越高
    const msUntilStart = start.getTime() - now.getTime();
    const totalDuration = end.getTime() - start.getTime();
    let timeScore;
    if (msUntilStart < 0) {
        // 已开始：根据是否已过结束时间
        const msAfterEnd = now.getTime() - end.getTime();
        timeScore = msAfterEnd > 0 ? 95 : 80 + 15 * (1 - msAfterEnd / totalDuration);
    } else {
        // 未开始：24小时内急剧上升，之后缓慢
        const hoursLeft = msUntilStart / (1000 * 60 * 60);
        timeScore = hoursLeft <= 0 ? 100
            : hoursLeft <= 1 ? 90
            : hoursLeft <= 2 ? 80
            : hoursLeft <= 6 ? 65
            : hoursLeft <= 24 ? 45
            : hoursLeft <= 72 ? 25
            : 10;
    }

    // 优先级评分 (0-100)
    const priorityMap = { high: 100, medium: 60, low: 20 };
    const priorityScore = priorityMap[schedule.priority] || 20;

    // 紧急程度评分 (0-100)
    const urgencyMap = { critical: 100, urgent: 70, normal: 30 };
    const urgencyScore = urgencyMap[schedule.urgency] || 30;

    // 综合加权：时间 50% + 优先级 25% + 紧急程度 25%
    const completedBonus = schedule.completed ? -200 : 0;
    return timeScore * 0.5 + priorityScore * 0.25 + urgencyScore * 0.25 + completedBonus;
}

// 紧急程度标签
function getUrgencyLabel(urgency) {
    const labels = { critical: '非常紧急', urgent: '紧急', normal: '一般' };
    return labels[urgency] || '一般';
}

// 渲染日程列表
function renderSchedules() {
    const container = document.getElementById('schedulesList');
    let schedules;

    if (searchQuery) {
        schedules = manager.search(searchQuery);
    } else {
        schedules = manager.getByStatus(currentFilter);
    }

    if (schedules.length === 0) {
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

    // 智能排序：综合评分由高到低
    schedules.sort((a, b) => getSmartScore(b) - getSmartScore(a));

    container.innerHTML = schedules.map(s => {
        const urgencyClass = s.urgency || 'normal';
        const timeInfo = formatTimeDisplay(s.start, s.end);
        return `
        <div class="schedule-item ${s.completed ? 'completed' : ''}" data-id="${s.id}">
            <div class="schedule-priority ${s.priority}"></div>
            <div class="schedule-info">
                <div class="schedule-title">${escapeHtml(s.title)}</div>
                <div class="schedule-desc">${escapeHtml(s.description || '暂无描述')}</div>
                <div class="schedule-meta">
                    <span class="meta-tag priority-tag-${s.priority}">${s.priority === 'high' ? '高优先级' : s.priority === 'medium' ? '中优先级' : '低优先级'}</span>
                    <span class="meta-tag urgency-tag-${urgencyClass}">${getUrgencyLabel(s.urgency)}</span>
                </div>
            </div>
            <div class="schedule-time">
                <div class="schedule-time-main">${timeInfo.time}</div>
                <div class="schedule-time-date">${timeInfo.date}</div>
            </div>
            <div class="schedule-actions">
                <button class="complete-btn ${s.completed ? 'done' : ''}" onclick="toggleComplete('${s.id}')" title="${s.completed ? '标为未完成' : '标为已完成'}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20,6 9,17 4,12"/>
                    </svg>
                </button>
                <button class="edit-btn" onclick="openEditModal('${s.id}')" title="编辑">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="delete-btn" onclick="deleteSchedule('${s.id}')" title="删除">
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
function toggleComplete(id) {
    manager.toggleComplete(id);
    renderSchedules();
    refreshDashboard();
    showToast('状态已更新');
}

// 删除日程
function deleteSchedule(id) {
    if (confirm('确定要删除该日程吗？')) {
        manager.delete(id);
        renderSchedules();
        refreshDashboard();
        showToast('日程已删除');
    }
}

// 打开编辑模态框
function openEditModal(id) {
    const schedule = manager.getAll().find(s => s.id === id);
    if (!schedule) return;

    document.getElementById('editId').value = id;
    document.getElementById('editTitle').value = schedule.title;
    document.getElementById('editStart').value = formatDateTimeLocal(new Date(schedule.start));
    document.getElementById('editEnd').value = formatDateTimeLocal(new Date(schedule.end));
    document.getElementById('editDesc').value = schedule.description || '';

    const priorityRadio = document.querySelector(`input[name="editPriority"][value="${schedule.priority}"]`);
    if (priorityRadio) priorityRadio.checked = true;

    const urgencyRadio = document.querySelector(`input[name="editUrgency"][value="${schedule.urgency || 'normal'}"]`);
    if (urgencyRadio) urgencyRadio.checked = true;

    document.getElementById('editModal').classList.add('active');
}

// 关闭编辑模态框
function closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
}

// 提交编辑
function handleEditSubmit(e) {
    if (e) e.preventDefault();

    const id = document.getElementById('editId').value;
    const title = document.getElementById('editTitle').value.trim();
    const start = document.getElementById('editStart').value;
    const end = document.getElementById('editEnd').value;
    const desc = document.getElementById('editDesc').value.trim();
    const priority = document.querySelector('input[name="editPriority"]:checked').value;
    const urgency = document.querySelector('input[name="editUrgency"]:checked').value;

    if (!title || !start || !end) {
        showToast('请填写完整信息', 'error');
        return false;
    }

    if (new Date(end) <= new Date(start)) {
        showToast('结束时间必须晚于开始时间', 'error');
        return false;
    }

    manager.update(id, { title, start, end, description: desc, priority, urgency });
    closeEditModal();
    renderSchedules();
    refreshDashboard();
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

// 搜索过滤
function filterSchedules() {
    searchQuery = document.getElementById('searchInput').value.trim();
    renderSchedules();
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

// 格式化时间显示（突出显示时间部分）
function formatTimeDisplay(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    const now = new Date();

    const sh = String(s.getHours()).padStart(2, '0');
    const smin = String(s.getMinutes()).padStart(2, '0');
    const eh = String(e.getHours()).padStart(2, '0');
    const emin = String(e.getMinutes()).padStart(2, '0');

    const time = `${sh}:${smin} - ${eh}:${emin}`;

    // 判断是否今天
    const isToday = s.toDateString() === now.toDateString();
    const isTomorrow = new Date(now.getTime() + 86400000).toDateString() === s.toDateString();

    let date;
    if (isToday) {
        date = '今天';
    } else if (isTomorrow) {
        date = '明天';
    } else {
        const month = s.getMonth() + 1;
        const day = s.getDate();
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        date = `${month}月${day}日 ${weekdays[s.getDay()]}`;
    }

    return { time, date };
}

// 点击模态框外部关闭
document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEditModal();
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeEditModal();
});
