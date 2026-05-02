const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// ========================================
// 数据库连接池
// ========================================
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'mimo_todo',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
});

// ========================================
// 中间件
// ========================================
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ========================================
// API 路由
// ========================================

// 获取所有日程
app.get('/api/schedules', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT *, start_time AS start, end_time AS `end` FROM schedules ORDER BY start_time DESC'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 新建日程
app.post('/api/schedules', async (req, res) => {
    try {
        const { id, title, description, start, end, priority, urgency, completed } = req.body;
        await pool.query(
            `INSERT INTO schedules (id, title, description, start_time, end_time, priority, urgency, completed)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, title, description || '', start, end, priority || 'low', urgency || 'normal', completed ? 1 : 0]
        );
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 更新日程
app.put('/api/schedules/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, start, end, priority, urgency, completed } = req.body;
        await pool.query(
            `UPDATE schedules SET title=?, description=?, start_time=?, end_time=?, priority=?, urgency=?, completed=?
             WHERE id=?`,
            [title, description || '', start, end, priority, urgency, completed ? 1 : 0, id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 删除日程
app.delete('/api/schedules/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM schedules WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 切换完成状态
app.patch('/api/schedules/:id/toggle', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT completed FROM schedules WHERE id=?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: '日程不存在' });
        const newVal = rows[0].completed ? 0 : 1;
        await pool.query('UPDATE schedules SET completed=? WHERE id=?', [newVal, req.params.id]);
        res.json({ success: true, completed: newVal });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 批量同步（前端 localStorage -> MySQL）
app.post('/api/schedules/sync', async (req, res) => {
    try {
        const { schedules } = req.body;
        if (!Array.isArray(schedules)) return res.status(400).json({ error: '参数错误' });

        for (const s of schedules) {
            await pool.query(
                `INSERT INTO schedules (id, title, description, start_time, end_time, priority, urgency, completed, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    title=VALUES(title), description=VALUES(description),
                    start_time=VALUES(start_time), end_time=VALUES(end_time),
                    priority=VALUES(priority), urgency=VALUES(urgency),
                    completed=VALUES(completed)`,
                [s.id, s.title, s.description || '', s.start, s.end,
                 s.priority || 'low', s.urgency || 'normal', s.completed ? 1 : 0, s.createdAt || new Date()]
            );
        }
        res.json({ success: true, synced: schedules.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// 回退到 index.html
// ========================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ========================================
// 启动服务器（监听所有网卡，支持局域网访问）
// ========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║     MIMO TODO 智能日程管理系统          ║');
    console.log('  ╠══════════════════════════════════════════╣');
    console.log(`  ║  本机访问: http://localhost:${PORT}        ║`);
    console.log(`  ║  局域网:   http://172.22.164.119:${PORT}   ║`);
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
});
