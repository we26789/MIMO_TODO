require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const multer = require('multer');
const ExcelJS = require('exceljs');

const app = express();
const PORT = 3000;

// ========================================
// 文件上传配置
// ========================================
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|webm|txt|md)$/i;
        if (allowed.test(path.extname(file.originalname))) cb(null, true);
        else cb(new Error('不支持的文件类型'));
    }
});

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
// 启动时自动迁移
// ========================================
(async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS goal_checkins (
                id INT AUTO_INCREMENT PRIMARY KEY,
                goal_id VARCHAR(30) NOT NULL,
                checkin_date DATE NOT NULL,
                note TEXT DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_checkin (goal_id, checkin_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        // 尝试添加新字段（如果已存在会忽略）
        try { await pool.query('ALTER TABLE goals ADD COLUMN checkin_required TINYINT(1) DEFAULT 1'); } catch {}
        try { await pool.query('ALTER TABLE goals ADD COLUMN checkin_remind TINYINT(1) DEFAULT 1'); } catch {}
        console.log('[迁移] goal_checkins 表就绪');
    } catch (err) {
        console.error('[迁移] 失败:', err.message);
    }
})();

// ========================================
// 中间件
// ========================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// gzip 压缩
app.use((req, res, next) => {
    if (req.headers['x-no-compression']) return next();
    const accept = req.headers['accept-encoding'] || '';
    if (!accept.includes('gzip')) return next();
    const ext = path.extname(req.url).toLowerCase();
    const compressible = ['.html', '.css', '.js', '.json', '.svg', '.xml', '.txt'];
    if (!compressible.includes(ext) && req.url !== '/') return next();
    const chunks = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    res.write = (data, ...args) => { chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data)); return true; };
    res.end = (data, ...args) => {
        if (data) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
        const body = Buffer.concat(chunks);
        if (body.length < 256) { origEnd(body); return; }
        zlib.gzip(body, (err, compressed) => {
            if (err || compressed.length >= body.length) { origEnd(body); return; }
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Content-Length', compressed.length);
            res.removeHeader('Content-Type');
            origEnd(compressed);
        });
    };
    next();
});

// 仅服务必要静态文件，排除 node_modules
const staticExcludes = ['/node_modules/'];
app.use((req, res, next) => {
    if (staticExcludes.some(ex => req.url.includes(ex))) return res.status(404).end();
    next();
});
app.use(express.static(__dirname, { index: 'index.html' }));
app.use('/uploads', express.static(uploadsDir));

// 音乐文件夹
const musicDir = path.join(__dirname, 'music');
if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });
app.use('/music', express.static(musicDir));

// 请求日志
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        if (ms > 1000 || res.statusCode >= 400) {
            console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url} → ${res.statusCode} (${ms}ms)`);
        }
    });
    next();
});

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

// 搜索日程（模糊匹配 + 相关度排序）
app.get('/api/schedules/search', async (req, res) => {
    try {
        const q = req.query.q || '';
        if (!q.trim()) return res.json([]);

        // 分词：按空格分割搜索词
        const keywords = q.trim().split(/\s+/);

        // 构建 LIKE 条件
        const conditions = keywords.map(() => '(title LIKE ? OR description LIKE ?)').join(' OR ');
        const params = [];
        keywords.forEach(kw => {
            params.push(`%${kw}%`, `%${kw}%`);
        });

        const [rows] = await pool.query(
            `SELECT *, start_time AS start, end_time AS \`end\`
             FROM schedules
             WHERE ${conditions}
             ORDER BY
                CASE WHEN title LIKE ? THEN 0 ELSE 1 END,
                CASE WHEN title LIKE ? THEN 0 ELSE 1 END,
                CASE WHEN description LIKE ? THEN 0 ELSE 1 END,
                start_time DESC
             LIMIT 20`,
            [...params, `%${q}%`, `%${q}%`, `%${q}%`]
        );

        // 计算相关度分数
        const scored = rows.map(s => {
            let score = 0;
            const titleLower = (s.title || '').toLowerCase();
            const descLower = (s.description || '').toLowerCase();
            const qLower = q.toLowerCase();

            // 标题完全匹配
            if (titleLower === qLower) score += 100;
            // 标题包含搜索词
            keywords.forEach(kw => {
                const kwLower = kw.toLowerCase();
                if (titleLower.includes(kwLower)) score += 30;
                if (descLower.includes(kwLower)) score += 10;
            });
            // 标题开头匹配加分
            if (titleLower.startsWith(qLower)) score += 50;
            // 未完成加分
            if (!s.completed) score += 5;

            return { ...s, score };
        });

        scored.sort((a, b) => b.score - a.score);
        res.json(scored);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 新建日程
app.post('/api/schedules', async (req, res) => {
    try {
        const { id, title, description, start, end, priority, urgency, category, energy_level, context_type, completed } = req.body;
        await pool.query(
            `INSERT INTO schedules (id, title, description, start_time, end_time, priority, urgency, category, energy_level, context_type, completed)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, title, description || '', start, end, priority || 'low', urgency || 'normal', category || 'work', energy_level || 'medium', context_type || 'anywhere', completed ? 1 : 0]
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
        const { title, description, start, end, priority, urgency, category, energy_level, context_type, completed } = req.body;
        await pool.query(
            `UPDATE schedules SET title=?, description=?, start_time=?, end_time=?, priority=?, urgency=?, category=?, energy_level=?, context_type=?, completed=?
             WHERE id=?`,
            [title, description || '', start, end, priority, urgency, category || 'work', energy_level || 'medium', context_type || 'anywhere', completed ? 1 : 0, id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 删除日程
app.delete('/api/schedules/:id', async (req, res) => {
    try {
        // 同时删除关联的成果文件
        const [rows] = await pool.query('SELECT achievements FROM schedules WHERE id=?', [req.params.id]);
        if (rows.length > 0 && rows[0].achievements) {
            const achs = typeof rows[0].achievements === 'string' ? JSON.parse(rows[0].achievements) : rows[0].achievements;
            if (Array.isArray(achs)) {
                achs.forEach(a => {
                    if (a.file) {
                        const fp = path.join(uploadsDir, a.file);
                        if (fs.existsSync(fp)) fs.unlinkSync(fp);
                    }
                });
            }
        }
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
        const completedAt = newVal ? new Date() : null;
        await pool.query('UPDATE schedules SET completed=?, completed_at=? WHERE id=?', [newVal, completedAt, req.params.id]);
        res.json({ success: true, completed: newVal, completed_at: completedAt });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 取消日程
app.patch('/api/schedules/:id/cancel', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id FROM schedules WHERE id=?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: '日程不存在' });
        const { cancel_reason } = req.body;
        await pool.query(
            'UPDATE schedules SET cancel_reason=?, cancelled_at=NOW() WHERE id=?',
            [cancel_reason || null, req.params.id]
        );
        res.json({ success: true, cancel_reason, cancelled_at: new Date() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 恢复已取消的日程
app.patch('/api/schedules/:id/restore', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT id FROM schedules WHERE id=?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: '日程不存在' });
        await pool.query(
            'UPDATE schedules SET cancel_reason=NULL, cancelled_at=NULL WHERE id=?',
            [req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// 成果 (Achievements) API
// ========================================

// 获取日程的成果
app.get('/api/schedules/:id/achievements', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT achievements FROM schedules WHERE id=?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: '日程不存在' });
        const achievements = rows[0].achievements
            ? (typeof rows[0].achievements === 'string' ? JSON.parse(rows[0].achievements) : rows[0].achievements)
            : [];
        res.json(achievements);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 添加成果（文字）
app.post('/api/schedules/:id/achievements', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ error: '内容不能为空' });

        const [rows] = await pool.query('SELECT achievements FROM schedules WHERE id=?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: '日程不存在' });

        const achievements = rows[0].achievements
            ? (typeof rows[0].achievements === 'string' ? JSON.parse(rows[0].achievements) : rows[0].achievements)
            : [];

        achievements.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            type: 'text',
            text: text.trim(),
            createdAt: new Date().toISOString()
        });

        await pool.query('UPDATE schedules SET achievements=? WHERE id=?', [JSON.stringify(achievements), req.params.id]);
        res.json({ success: true, achievements });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 添加成果（文件上传 - 图片/视频）
app.post('/api/schedules/:id/achievements/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '请选择文件' });

        const [rows] = await pool.query('SELECT achievements FROM schedules WHERE id=?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: '日程不存在' });

        const achievements = rows[0].achievements
            ? (typeof rows[0].achievements === 'string' ? JSON.parse(rows[0].achievements) : rows[0].achievements)
            : [];

        const ext = path.extname(req.file.originalname).toLowerCase();
        const isVideo = /\.(mp4|mov|avi|webm)$/i.test(ext);
        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(ext);

        achievements.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            type: isVideo ? 'video' : isImage ? 'image' : 'file',
            file: req.file.filename,
            originalName: req.file.originalname,
            fileSize: req.file.size,
            createdAt: new Date().toISOString()
        });

        await pool.query('UPDATE schedules SET achievements=? WHERE id=?', [JSON.stringify(achievements), req.params.id]);
        res.json({ success: true, achievements });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 删除成果
app.delete('/api/schedules/:id/achievements/:achId', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT achievements FROM schedules WHERE id=?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: '日程不存在' });

        let achievements = rows[0].achievements
            ? (typeof rows[0].achievements === 'string' ? JSON.parse(rows[0].achievements) : rows[0].achievements)
            : [];

        const target = achievements.find(a => a.id === req.params.achId);
        if (target && target.file) {
            const fp = path.join(uploadsDir, target.file);
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }

        achievements = achievements.filter(a => a.id !== req.params.achId);
        await pool.query('UPDATE schedules SET achievements=? WHERE id=?', [JSON.stringify(achievements), req.params.id]);
        res.json({ success: true, achievements });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 批量同步
app.post('/api/schedules/sync', async (req, res) => {
    try {
        const { schedules } = req.body;
        if (!Array.isArray(schedules)) return res.status(400).json({ error: '参数错误' });
        for (const s of schedules) {
            await pool.query(
                `INSERT INTO schedules (id, title, description, start_time, end_time, priority, urgency, category, energy_level, context_type, completed, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    title=VALUES(title), description=VALUES(description),
                    start_time=VALUES(start_time), end_time=VALUES(end_time),
                    priority=VALUES(priority), urgency=VALUES(urgency),
                    category=VALUES(category), energy_level=VALUES(energy_level),
                    context_type=VALUES(context_type), completed=VALUES(completed)`,
                [s.id, s.title, s.description || '', s.start, s.end,
                 s.priority || 'low', s.urgency || 'normal', s.category || 'work', s.energy_level || 'medium', s.context_type || 'anywhere',
                 s.completed ? 1 : 0, s.createdAt || new Date()]
            );
        }
        res.json({ success: true, synced: schedules.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// 音乐列表 API
// ========================================
app.get('/api/music', (req, res) => {
    try {
        if (!fs.existsSync(musicDir)) return res.json([]);
        const files = fs.readdirSync(musicDir).filter(f => /\.(mp3|ogg)$/i.test(f));
        const tracks = files.map((f, i) => ({
            id: i,
            filename: f,
            name: decodeURIComponent(f.replace(/\.mp3$/i, '').replace(/_/g, ' ')),
            url: `/music/${encodeURIComponent(f)}`,
        }));
        res.json(tracks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// 统计数据 API（视角视图用）
// ========================================
app.get('/api/schedules/stats', async (req, res) => {
    try {
        const [byCategory] = await pool.query(
            `SELECT category, COUNT(*) as count,
             SUM(TIMESTAMPDIFF(MINUTE, start_time, end_time)) as totalMinutes
             FROM schedules GROUP BY category`
        );
        const [byEnergy] = await pool.query(
            `SELECT energy_level, COUNT(*) as count FROM schedules GROUP BY energy_level`
        );
        res.json({ byCategory, byEnergy });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// 周报 API
// ========================================
function formatDateLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekRange(startDateStr) {
    const parts = startDateStr.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const day = d.getDay() || 7;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day + 1);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
    return { monday, sunday };
}

app.get('/api/schedules/weekly-report', async (req, res) => {
    try {
        const startDate = req.query.startDate || formatDateLocal(new Date());
        const { monday, sunday } = getWeekRange(startDate);
        const mondayStr = formatDateLocal(monday);
        const endDate = formatDateLocal(sunday);

        const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

        // 基础统计（cancel_reason 列可能不存在，分开查询）
        const [overview] = await pool.query(
            `SELECT COUNT(*) as total,
                    SUM(completed) as completedCount,
                    SUM(TIMESTAMPDIFF(MINUTE, start_time, end_time)) as totalMinutes
             FROM schedules WHERE start_time >= ? AND start_time < ?`,
            [mondayStr, endDate]
        );
        let cancelledCount = 0;
        try {
            const [cancelRows] = await pool.query(
                `SELECT SUM(CASE WHEN cancel_reason IS NOT NULL THEN 1 ELSE 0 END) as cancelledCount
                 FROM schedules WHERE start_time >= ? AND start_time < ?`,
                [mondayStr, endDate]
            );
            cancelledCount = cancelRows[0].cancelledCount || 0;
        } catch (e) { /* cancel_reason column doesn't exist yet */ }

        // 分类统计
        const [byCategory] = await pool.query(
            `SELECT category, COUNT(*) as count,
                    SUM(TIMESTAMPDIFF(MINUTE, start_time, end_time)) as totalMinutes
             FROM schedules WHERE start_time >= ? AND start_time < ?
             GROUP BY category ORDER BY totalMinutes DESC`,
            [mondayStr, endDate]
        );

        // 每日统计
        const [byDay] = await pool.query(
            `SELECT DATE(start_time) as date, COUNT(*) as count,
                    SUM(TIMESTAMPDIFF(MINUTE, start_time, end_time)) as totalMinutes
             FROM schedules WHERE start_time >= ? AND start_time < ?
             GROUP BY DATE(start_time) ORDER BY date`,
            [mondayStr, endDate]
        );
        const byDayWithLabels = byDay.map(d => ({
            ...d,
            dayLabel: dayLabels[(new Date(d.date).getDay() + 6) % 7]
        }));

        // 精力等级统计
        const [byEnergy] = await pool.query(
            `SELECT energy_level, COUNT(*) as count
             FROM schedules WHERE start_time >= ? AND start_time < ?
             GROUP BY energy_level`,
            [mondayStr, endDate]
        );

        // 时段统计
        const [byPeriod] = await pool.query(
            `SELECT
                CASE
                    WHEN HOUR(start_time) >= 6 AND HOUR(start_time) < 9 THEN 'morning'
                    WHEN HOUR(start_time) >= 9 AND HOUR(start_time) < 12 THEN 'am'
                    WHEN HOUR(start_time) >= 12 AND HOUR(start_time) < 18 THEN 'pm'
                    WHEN HOUR(start_time) >= 18 AND HOUR(start_time) < 22 THEN 'evening'
                    ELSE 'night'
                END as period,
                COUNT(*) as count
             FROM schedules WHERE start_time >= ? AND start_time < ?
             GROUP BY period`,
            [mondayStr, endDate]
        );

        // 优先级统计
        const [byPriority] = await pool.query(
            `SELECT priority, COUNT(*) as count
             FROM schedules WHERE start_time >= ? AND start_time < ?
             GROUP BY priority`,
            [mondayStr, endDate]
        );

        // 24小时分布
        const [hourlyRows] = await pool.query(
            `SELECT HOUR(start_time) as hour, COUNT(*) as count
             FROM schedules WHERE start_time >= ? AND start_time < ?
             GROUP BY HOUR(start_time)`,
            [mondayStr, endDate]
        );
        const hourlyDistribution = Array(24).fill(0);
        hourlyRows.forEach(r => { hourlyDistribution[r.hour] = r.count; });

        const weekEnd = new Date(monday);
        weekEnd.setDate(monday.getDate() + 6);

        res.json({
            weekLabel: `${monday.getFullYear()}年${monday.getMonth() + 1}月${monday.getDate()}日 - ${weekEnd.getFullYear()}年${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日`,
            totalSchedules: overview[0].total || 0,
            completedCount: overview[0].completedCount || 0,
            cancelledCount,
            totalMinutes: overview[0].totalMinutes || 0,
            byCategory,
            byDay: byDayWithLabels,
            byEnergy,
            byPeriod,
            byPriority,
            hourlyDistribution
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 周报 Excel 导出
app.get('/api/schedules/weekly-export', async (req, res) => {
    try {
        const startDate = req.query.startDate || formatDateLocal(new Date());
        const { monday, sunday } = getWeekRange(startDate);
        const mondayStr = formatDateLocal(monday);
        const endDate = formatDateLocal(sunday);

        // 查询该周所有日程（安全查询，兼容没有 cancel_reason 列的情况）
        let schedules;
        try {
            [schedules] = await pool.query(
                `SELECT title, category, start_time, end_time, priority, urgency,
                        energy_level, completed, cancel_reason
                 FROM schedules WHERE start_time >= ? AND start_time < ?
                 ORDER BY start_time`,
                [mondayStr, endDate]
            );
        } catch (e) {
            [schedules] = await pool.query(
                `SELECT title, category, start_time, end_time, priority, urgency,
                        energy_level, completed
                 FROM schedules WHERE start_time >= ? AND start_time < ?
                 ORDER BY start_time`,
                [mondayStr, endDate]
            );
        }

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'MIMO TODO';
        workbook.created = new Date();

        // Sheet 1: 周报概览
        const ws1 = workbook.addWorksheet('周报概览');
        const weekEnd = new Date(monday);
        weekEnd.setDate(monday.getDate() + 6);
        const totalMinutes = schedules.reduce((sum, s) => {
            return sum + (new Date(s.end_time) - new Date(s.start_time)) / 60000;
        }, 0);
        const completedCount = schedules.filter(s => s.completed).length;
        const cancelledCount = schedules.filter(s => s.cancel_reason || s.cancelled_at).length;

        ws1.columns = [
            { header: '项目', key: 'label', width: 20 },
            { header: '数据', key: 'value', width: 30 }
        ];
        ws1.getRow(1).font = { bold: true, size: 12 };
        ws1.addRow({ label: '周报周期', value: `${monday.getFullYear()}年${monday.getMonth()+1}月${monday.getDate()}日 - ${weekEnd.getFullYear()}年${weekEnd.getMonth()+1}月${weekEnd.getDate()}日` });
        ws1.addRow({ label: '总日程数', value: schedules.length });
        ws1.addRow({ label: '已完成', value: completedCount });
        ws1.addRow({ label: '已取消', value: cancelledCount });
        ws1.addRow({ label: '总时长(分钟)', value: Math.round(totalMinutes) });
        ws1.addRow({ label: '总时长(小时)', value: (totalMinutes / 60).toFixed(1) });
        ws1.addRow({ label: '完成率', value: schedules.length > 0 ? (completedCount / schedules.length * 100).toFixed(1) + '%' : '0%' });

        // Sheet 2: 每日明细
        const ws2 = workbook.addWorksheet('每日明细');
        ws2.columns = [
            { header: '日期', key: 'date', width: 14 },
            { header: '时间段', key: 'time', width: 16 },
            { header: '日程名称', key: 'title', width: 30 },
            { header: '分类', key: 'category', width: 10 },
            { header: '优先级', key: 'priority', width: 10 },
            { header: '精力等级', key: 'energy', width: 10 },
            { header: '状态', key: 'status', width: 10 }
        ];
        ws2.getRow(1).font = { bold: true, size: 12 };
        const catMap = { work: '工作', eating: '吃饭', exercise: '运动', study: '学习' };
        const priMap = { high: '高', medium: '中', low: '低' };
        const enMap = { high: '高', medium: '中', low: '低' };
        schedules.forEach(s => {
            const st = new Date(s.start_time);
            const et = new Date(s.end_time);
            const status = (s.cancel_reason || s.cancelled_at) ? '已取消' : s.completed ? '已完成' : '进行中';
            ws2.addRow({
                date: `${st.getFullYear()}-${String(st.getMonth()+1).padStart(2,'0')}-${String(st.getDate()).padStart(2,'0')}`,
                time: `${String(st.getHours()).padStart(2,'0')}:${String(st.getMinutes()).padStart(2,'0')}-${String(et.getHours()).padStart(2,'0')}:${String(et.getMinutes()).padStart(2,'0')}`,
                title: s.title,
                category: catMap[s.category] || s.category,
                priority: priMap[s.priority] || s.priority,
                energy: enMap[s.energy_level] || s.energy_level,
                status
            });
        });

        // Sheet 3: 分类统计
        const ws3 = workbook.addWorksheet('分类统计');
        ws3.columns = [
            { header: '分类', key: 'category', width: 12 },
            { header: '数量', key: 'count', width: 10 },
            { header: '总时长(分钟)', key: 'minutes', width: 16 },
            { header: '占比', key: 'pct', width: 10 }
        ];
        ws3.getRow(1).font = { bold: true, size: 12 };
        const totalMin = totalMinutes || 1;
        const catStats = {};
        schedules.forEach(s => {
            if (!catStats[s.category]) catStats[s.category] = { count: 0, minutes: 0 };
            catStats[s.category].count++;
            catStats[s.category].minutes += (new Date(s.end_time) - new Date(s.start_time)) / 60000;
        });
        Object.entries(catStats).forEach(([cat, data]) => {
            ws3.addRow({
                category: catMap[cat] || cat,
                count: data.count,
                minutes: Math.round(data.minutes),
                pct: (data.minutes / totalMin * 100).toFixed(1) + '%'
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="weekly-report-${startDate}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// 天气 API 代理
// ========================================
app.get('/api/weather', async (req, res) => {
    try {
        const city = req.query.city || 'Beijing';
        const weatherRes = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!weatherRes.ok) return res.status(502).json({ error: '天气服务不可用' });
        const data = await weatherRes.json();
        const current = data.current_condition?.[0];
        if (!current) return res.status(502).json({ error: '无法获取天气数据' });

        const temp = parseInt(current.temp_C);
        const desc = current.weatherDesc?.[0]?.value || '未知';
        const code = parseInt(current.weatherCode);

        // 判断是否为恶劣天气
        const isBadWeather = code >= 296 && code <= 399 // 雨
            || code >= 179 && code <= 199 // 雪
            || code >= 200 && code <= 299 // 雷暴
            || temp >= 35 || temp <= -10; // 极端温度

        // 天气图标映射
        let icon = '☀️';
        if (code >= 179 && code <= 199) icon = '🌨️';
        else if (code >= 200 && code <= 299) icon = '⛈️';
        else if (code >= 296 && code <= 399) icon = '🌧️';
        else if (code >= 113 && code <= 113) icon = '☀️';
        else if (code >= 116 && code <= 116) icon = '⛅';
        else if (code >= 119 && code <= 119) icon = '☁️';
        else if (code >= 122 && code <= 122) icon = '☁️';
        else if (code >= 143 && code <= 143) icon = '🌫️';
        else if (code >= 248 && code <= 260) icon = '🌫️';

        res.json({ temp, condition: desc, icon, isBadWeather, city });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 多日天气预报
app.get('/api/weather/forecast', async (req, res) => {
    try {
        const city = req.query.city || 'Beijing';
        const days = Math.min(parseInt(req.query.days) || 3, 7);
        const weatherRes = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!weatherRes.ok) return res.status(502).json({ error: '天气服务不可用' });
        const data = await weatherRes.json();

        function mapWeatherCode(code, temp) {
            const c = parseInt(code);
            const t = parseInt(temp);
            const isBad = (c >= 296 && c <= 399) || (c >= 179 && c <= 199)
                || (c >= 200 && c <= 299) || t >= 35 || t <= -10;
            let icon = '☀️';
            if (c >= 179 && c <= 199) icon = '🌨️';
            else if (c >= 200 && c <= 299) icon = '⛈️';
            else if (c >= 296 && c <= 399) icon = '🌧️';
            else if (c === 113) icon = '☀️';
            else if (c === 116) icon = '⛅';
            else if (c === 119 || c === 122) icon = '☁️';
            else if (c === 143 || (c >= 248 && c <= 260)) icon = '🌫️';
            return { icon, isBadWeather: isBad };
        }

        const forecast = (data.weather || []).slice(0, days).map((day, i) => {
            const dateStr = day.date;
            const maxTemp = parseInt(day.maxtempC);
            const minTemp = parseInt(day.mintempC);
            const avgCode = day.hourly?.[4]?.weatherCode || '113';
            const avgDesc = day.hourly?.[4]?.weatherDesc?.[0]?.value || '未知';
            const avgTemp = Math.round((maxTemp + minTemp) / 2);
            const { icon, isBadWeather } = mapWeatherCode(avgCode, avgTemp);
            const d = new Date(dateStr);
            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            const label = i === 0 ? '今天' : i === 1 ? '明天' : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`;
            return { date: dateStr, label, temp: avgTemp, maxTemp, minTemp, condition: avgDesc, icon, isBadWeather };
        });

        res.json({ city, forecast });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// AI 智能日程创建
// ========================================

// 会话历史缓存 (sessionId -> { messages: [], lastActive: Date })
const sessionCache = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30分钟过期

// 定期清理过期会话
setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessionCache) {
        if (now - session.lastActive > SESSION_TTL) sessionCache.delete(id);
    }
}, 5 * 60 * 1000);

// SYSTEM_PROMPT 不再在启动时固化当前时间，改为每次请求动态注入
const SYSTEM_PROMPT_TEMPLATE = `你是一个智能日程助手。用户会用自然语言描述日程需求，你可以帮用户创建日程，也可以和用户交互确认细节。

当前时间：{CURRENT_TIME}

## 两种输出模式

### 模式A：信息充分，直接创建日程
当用户描述中包含足够的信息（至少有大致的日期/时间和事项内容）时，用此模式。
先用1-2句话简要说明你理解了什么，然后附上 JSON：
\`\`\`json
[{
  "title": "日程标题（简洁明确）",
  "description": "日程描述（可选）",
  "start": "2026-05-03T14:00",
  "end": "2026-05-03T16:00",
  "priority": "low|medium|high",
  "urgency": "normal|urgent|critical",
  "category": "work|eating|exercise|study",
  "energy_level": "high|medium|low",
  "context_type": "computer|phone|outdoor|meeting|anywhere"
}]
\`\`\`

### 模式B：信息不足，交互询问
当用户描述模糊、缺少关键信息、或有多种理解方式时，用此模式。
**不要猜测**，而是用自然语言向用户询问需要确认的事项。例如：
- "你提到要安排会议，请问具体是哪一天？几点到几点？"
- "这周有3个可能的时间段，你倾向哪个？"
- "你希望每次复习多长时间？需要我帮你安排每天的固定时间段吗？"

直接用自然语言回复即可，**不要输出 JSON**。

## 时间解析规则

- "明天下午2点" → 根据当前时间计算具体日期和时间
- "下周三上午9点到11点" → 计算下周三的具体日期
- "2小时后" → 从当前时间开始算
- "这周五" → 计算最近的周五
- "每天晚上8点" → 创建今天起的一个日程
- 如果只给了开始时间没给结束时间，默认持续2小时
- 所有时间使用 24 小时制，格式为 YYYY-MM-DDTHH:MM
- 支持一次请求包含多个不同日期/类型的日程

## 优先级和紧急程度推断

- 高优先级: 考试、面试、截止日期、重要会议
- 中优先级: 普通会议、约会、定期任务
- 低优先级: 休闲、日常琐事
- 非常紧急(critical): 马上要发生的、逾期的
- 紧急(urgent): 今天或明天内需要完成的
- 一般(normal): 未来几天的安排

## 类别推断 (category)

- 工作(work): 工作任务、会议、项目、汇报、办公相关
- 吃饭(eating): 吃饭、用餐、聚餐、外卖、做饭
- 运动(exercise): 运动、健身、跑步、游泳、打球、锻炼
- 学习(study): 学习、阅读、培训、考试、写作业、看教程

## 能量等级推断 (energy_level)

- 高能量(high): 深度工作、重要决策、创造性任务、考试、面试
- 中能量(medium): 普通会议、邮件处理、文档撰写
- 低能量(low): 整理文件、回复消息、简单杂务、休闲娱乐

## 情境类型推断 (context_type)

- 电脑前(computer): 编程、写文档、设计、在线学习
- 打电话(phone): 通话、视频会议、语音沟通
- 外出(outdoor): 出门办事、运动、聚会、旅行
- 会议(meeting): 面对面会议、团队讨论、商务会谈
- 无特定(anywhere): 阅读、思考、规划等不限地点的任务

## 其他规则

- 一次可以创建多个日程（如"帮我安排下周的会议"）
- JSON 必须包裹在 \`\`\`json 和 \`\`\` 代码块中
- title 不能为空，必须是用户能理解的中文标题
- 如果用户只是在聊天或提问，正常对话即可，不需要输出 JSON`;

// 获取或创建会话
function getSession(sessionId) {
    if (!sessionId) sessionId = 'default';
    if (!sessionCache.has(sessionId)) {
        sessionCache.set(sessionId, { messages: [], lastActive: Date.now() });
    }
    const session = sessionCache.get(sessionId);
    session.lastActive = Date.now();
    return session;
}

// 调用 MiMo AI
app.post('/api/ai/create', async (req, res) => {
    try {
        const { message, sessionId } = req.body;
        if (!message || !message.trim()) return res.status(400).json({ error: '请输入日程描述' });

        const apiKey = process.env.MIMO_API_KEY;
        if (!apiKey || apiKey === 'your-api-key-here') {
            return res.status(500).json({ error: '请先在 .env 文件中配置 MIMO_API_KEY' });
        }

        const session = getSession(sessionId);

        // 追加用户消息（只保留最近6轮以控制token）
        session.messages.push({ role: 'user', content: message.trim() });
        if (session.messages.length > 12) {
            session.messages = session.messages.slice(-12);
        }

        // 每次请求动态注入当前时间
        const currentTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('{CURRENT_TIME}', currentTime);

        const payload = {
            model: 'mimo-v2.5-pro',
            messages: [
                { role: 'system', content: systemPrompt },
                ...session.messages
            ],
            temperature: 0.5,
            max_tokens: 4096,
        };

        const aiRes = await fetch('https://token-plan-cn.xiaomimimo.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(60000),
        });

        if (!aiRes.ok) {
            const errText = await aiRes.text();
            console.error('AI API 错误:', aiRes.status, errText);
            let errMsg = 'AI 服务暂时不可用，请稍后重试';
            try { const parsed = JSON.parse(errText); errMsg = parsed.error?.message || errMsg; } catch {}
            return res.status(502).json({ error: errMsg });
        }

        const aiData = await aiRes.json();
        const reply = aiData.choices?.[0]?.message?.content || '';

        // 追加助手回复到会话
        session.messages.push({ role: 'assistant', content: reply });

        // 从回复中提取 JSON
        const schedules = extractSchedulesFromReply(reply);

        res.json({
            success: true,
            reply: reply.replace(/```json\s*[\s\S]*?```/g, '').replace(/```\s*/g, '').trim(),
            schedules,
        });
    } catch (err) {
        console.error('AI 创建失败:', err);
        if (err.name === 'TimeoutError' || err.code === 'ABORT_ERR') {
            return res.status(504).json({ error: 'AI 响应超时，请稍后重试' });
        }
        res.status(500).json({ error: '服务器错误: ' + err.message });
    }
});

// 清除会话
app.post('/api/ai/clear', (req, res) => {
    const { sessionId } = req.body;
    if (sessionId) sessionCache.delete(sessionId);
    res.json({ success: true });
});

// 从 AI 回复中提取日程 JSON
function extractSchedulesFromReply(reply) {
    try {
        // 提取 ```json ... ``` 代码块
        const jsonMatch = reply.match(/```json\s*([\s\S]*?)```/);
        if (!jsonMatch) {
            // 尝试直接匹配 [ ... ]
            const arrMatch = reply.match(/\[[\s\S]*\]/);
            if (arrMatch) return JSON.parse(arrMatch[0]);
            return [];
        }
        const parsed = JSON.parse(jsonMatch[1].trim());
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        return [];
    }
}

// 一键确认创建日程
app.post('/api/ai/confirm', async (req, res) => {
    try {
        const { schedules } = req.body;
        if (!Array.isArray(schedules) || !schedules.length) {
            return res.status(400).json({ error: '没有可创建的日程' });
        }
        const created = [];
        for (const s of schedules) {
            const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
            const start = s.start ? s.start.replace(' ', 'T') : new Date().toISOString().slice(0, 16);
            const end = s.end ? s.end.replace(' ', 'T') : new Date(Date.now() + 7200000).toISOString().slice(0, 16);
            await pool.query(
                `INSERT INTO schedules (id, title, description, start_time, end_time, priority, urgency, category, energy_level, context_type, completed)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
                [id, s.title || '未命名日程', s.description || '', start, end,
                 s.priority || 'low', s.urgency || 'normal', s.category || 'work', s.energy_level || 'medium', s.context_type || 'anywhere']
            );
            created.push({ id, title: s.title });
        }
        res.json({ success: true, created });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// 目标管理 API
// ========================================

// GET /api/goals — 获取所有目标
app.get('/api/goals', async (req, res) => {
    try {
        const [goals] = await pool.query(
            `SELECT g.*, COUNT(gs.id) as scheduleCount
             FROM goals g
             LEFT JOIN goal_schedules gs ON gs.goal_id = g.id
             GROUP BY g.id
             ORDER BY g.created_at DESC`
        );

        // 查询每个目标的实际完成分钟数
        for (const goal of goals) {
            try {
                const [rows] = await pool.query(
                    `SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE, s.start_time, s.end_time)), 0) as actualMinutes
                     FROM goal_schedules gs
                     JOIN schedules s ON s.id = gs.schedule_id
                     WHERE gs.goal_id = ?`,
                    [goal.id]
                );
                goal.actualMinutes = rows[0].actualMinutes || 0;
            } catch (e) {
                goal.actualMinutes = 0;
            }
        }

        res.json(goals);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/goals — 创建目标
app.post('/api/goals', async (req, res) => {
    try {
        const { title, description, type, target_category, start_date, end_date,
                checkin_required, checkin_remind, checkin_start_time, checkin_end_time } = req.body;
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        await pool.query(
            `INSERT INTO goals (id, title, description, type, target_category, start_date, end_date,
                                checkin_required, checkin_remind, checkin_start_time, checkin_end_time)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, title, description || '', type || 'monthly', target_category || null,
             start_date || null, end_date || null,
             checkin_required !== undefined ? (checkin_required ? 1 : 0) : 1,
             checkin_remind !== undefined ? (checkin_remind ? 1 : 0) : 1,
             checkin_start_time || null, checkin_end_time || null]
        );
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/goals/:id — 更新目标
app.put('/api/goals/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, type, target_category, start_date, end_date, status,
                checkin_required, checkin_remind, checkin_start_time, checkin_end_time,
                cancel_reason } = req.body;

        // 处理取消逻辑
        let cancelled_at = null;
        if (status === 'cancelled') {
            cancelled_at = new Date();
        }

        await pool.query(
            `UPDATE goals SET title=?, description=?, type=?, target_category=?, start_date=?, end_date=?,
                    status=?, checkin_required=?, checkin_remind=?,
                    checkin_start_time=?, checkin_end_time=?, cancel_reason=?, cancelled_at=?
             WHERE id=?`,
            [title || '', description || '', type || 'monthly', target_category || null,
             start_date || null, end_date || null, status || 'active',
             checkin_required !== undefined ? (checkin_required ? 1 : 0) : 1,
             checkin_remind !== undefined ? (checkin_remind ? 1 : 0) : 1,
             checkin_start_time || null, checkin_end_time || null,
             cancel_reason || null, cancelled_at, id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/goals/:id — 删除目标
app.delete('/api/goals/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM goal_checkins WHERE goal_id=?', [req.params.id]);
        await pool.query('DELETE FROM goal_schedules WHERE goal_id=?', [req.params.id]);
        await pool.query('DELETE FROM goals WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/goals/:id/cancel — 取消目标
app.patch('/api/goals/:id/cancel', async (req, res) => {
    try {
        const { cancel_reason } = req.body;
        await pool.query(
            `UPDATE goals SET status='cancelled', cancel_reason=?, cancelled_at=NOW() WHERE id=?`,
            [cancel_reason || null, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/goals/:id/restore — 恢复已取消的目标
app.patch('/api/goals/:id/restore', async (req, res) => {
    try {
        await pool.query(
            `UPDATE goals SET status='active', cancel_reason=NULL, cancelled_at=NULL WHERE id=?`,
            [req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/goals/:id/bind — 绑定日程到目标
app.post('/api/goals/:id/bind', async (req, res) => {
    try {
        const { scheduleId } = req.body;
        await pool.query(
            'INSERT INTO goal_schedules (goal_id, schedule_id) VALUES (?, ?)',
            [req.params.id, scheduleId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/goals/:id/unbind/:scheduleId — 解绑日程
app.delete('/api/goals/:id/unbind/:scheduleId', async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM goal_schedules WHERE goal_id=? AND schedule_id=?',
            [req.params.id, req.params.scheduleId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/goals/:id/schedules — 获取目标关联的日程
app.get('/api/goals/:id/schedules', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT s.*, s.start_time AS start, s.end_time AS \`end\`
             FROM goal_schedules gs
             JOIN schedules s ON s.id = gs.schedule_id
             WHERE gs.goal_id = ?
             ORDER BY s.start_time DESC`,
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/goals/:id/checkin — 打卡
app.post('/api/goals/:id/checkin', async (req, res) => {
    try {
        const { note } = req.body || {};
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        await pool.query(
            'INSERT INTO goal_checkins (goal_id, checkin_date, note) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE note=VALUES(note)',
            [req.params.id, today, note || null]
        );
        res.json({ success: true, date: today });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/goals/:id/checkin/:checkinId — 取消打卡
app.delete('/api/goals/:id/checkin/:checkinId', async (req, res) => {
    try {
        await pool.query('DELETE FROM goal_checkins WHERE id=? AND goal_id=?', [req.params.checkinId, req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/goals/:id/checkins — 获取打卡记录
app.get('/api/goals/:id/checkins', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const [rows] = await pool.query(
            "SELECT id, goal_id, DATE_FORMAT(checkin_date, '%Y-%m-%d') as checkin_date, note, created_at, status, checkin_time FROM goal_checkins WHERE goal_id=? AND checkin_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY) ORDER BY checkin_date DESC",
            [req.params.id, days]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/goals/checkin-remind — 检查今日需要打卡的目标并提醒
app.get('/api/goals/checkin-remind', async (req, res) => {
    try {
        const now2 = new Date();
        const today = `${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}-${String(now2.getDate()).padStart(2,'0')}`;
        const now = new Date();

        // 获取所有需要打卡且未完成的目标
        const [goals] = await pool.query(
            `SELECT g.* FROM goals g
             WHERE g.status = 'active'
             AND g.checkin_required = 1
             AND g.checkin_remind = 1
             AND g.start_date <= ?
             AND g.end_date >= ?`,
            [today, today]
        );

        const reminders = [];
        for (const goal of goals) {
            // 检查今天是否已打卡
            const [checkins] = await pool.query(
                'SELECT id FROM goal_checkins WHERE goal_id=? AND checkin_date=?',
                [goal.id, today]
            );

            if (checkins.length === 0) {
                // 检查是否在打卡时间范围内
                let shouldRemind = true;
                if (goal.checkin_start_time && goal.checkin_end_time) {
                    const currentTime = now.toTimeString().slice(0, 5); // HH:mm
                    shouldRemind = currentTime >= goal.checkin_start_time && currentTime <= goal.checkin_end_time;
                }

                if (shouldRemind) {
                    reminders.push({
                        goal_id: goal.id,
                        goal_title: goal.title,
                        message: `目标「${goal.title}」今日还未打卡`
                    });
                }
            }
        }

        res.json(reminders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/goals/:id/achievements — 添加目标成果
app.post('/api/goals/:id/achievements', async (req, res) => {
    try {
        const { content, type } = req.body; // type: 'text' or 'file'
        const goalId = req.params.id;

        // 获取现有的成果
        const [goals] = await pool.query('SELECT achievements FROM goals WHERE id=?', [goalId]);
        let achievements = goals[0]?.achievements || [];

        const newAchievement = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            content,
            type: type || 'text',
            created_at: new Date().toISOString()
        };

        achievements.push(newAchievement);

        await pool.query(
            'UPDATE goals SET achievements=? WHERE id=?',
            [JSON.stringify(achievements), goalId]
        );

        res.json({ success: true, achievement: newAchievement });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/goals/:id/achievements/:achId — 删除目标成果
app.delete('/api/goals/:id/achievements/:achId', async (req, res) => {
    try {
        const { id, achId } = req.params;

        const [goals] = await pool.query('SELECT achievements FROM goals WHERE id=?', [id]);
        let achievements = goals[0]?.achievements || [];
        achievements = achievements.filter(a => a.id !== achId);

        await pool.query(
            'UPDATE goals SET achievements=? WHERE id=?',
            [JSON.stringify(achievements), id]
        );

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/goals/:id/achievements/upload — 上传目标成果文件
app.post('/api/goals/:id/achievements/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '请选择文件' });
        const goalId = req.params.id;
        const fileUrl = `/uploads/${req.file.filename}`;
        const fileType = req.file.mimetype.startsWith('image/') ? 'image' :
                        req.file.mimetype.startsWith('video/') ? 'video' : 'file';

        // 获取现有的成果
        const [goals] = await pool.query('SELECT achievements FROM goals WHERE id=?', [goalId]);
        let achievements = goals[0]?.achievements || [];

        const newAchievement = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            content: fileUrl,
            type: fileType,
            filename: req.file.originalname,
            created_at: new Date().toISOString()
        };

        achievements.push(newAchievement);

        await pool.query(
            'UPDATE goals SET achievements=? WHERE id=?',
            [JSON.stringify(achievements), goalId]
        );

        res.json({ success: true, achievement: newAchievement });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// AI 智能创建目标
// ========================================
const GOAL_AI_PROMPT = `你是一个智能目标助手。用户会用自然语言描述目标，你帮用户解析为目标结构化数据。

当前时间：{CURRENT_TIME}

## 两种输出模式

### 模式A：信息充分，直接创建目标
当用户描述中包含足够的信息时，用此模式。先用1-2句话简要说明，然后附上 JSON：
\`\`\`json
{
  "title": "目标名称",
  "description": "目标描述（可选）",
  "type": "yearly|quarterly|monthly|weekly|daily",
  "target_category": "work|eating|exercise|study",
  "start_date": "2026-05-01",
  "end_date": "2026-05-31",
  "checkin_required": true
}
\`\`\`

### 模式B：信息不足，交互询问
用自然语言向用户询问需要确认的事项。不要输出 JSON。

## 规则
- type 根据用户描述的时间跨度推断：年/季度/月/周/日
- start_date 默认今天，end_date 根据 type 推算
- checkin_required 默认为 true（需要打卡）
- 只输出一个目标的 JSON，不要输出数组`;

app.post('/api/ai/goal', async (req, res) => {
    try {
        const { message, sessionId } = req.body;
        if (!message || !message.trim()) return res.status(400).json({ error: '请输入目标描述' });

        const apiKey = process.env.MIMO_API_KEY;
        if (!apiKey || apiKey === 'your-api-key-here') {
            return res.status(500).json({ error: '请先在 .env 文件中配置 MIMO_API_KEY' });
        }

        const session = getSession(sessionId);
        session.messages.push({ role: 'user', content: message.trim() });
        if (session.messages.length > 12) session.messages = session.messages.slice(-12);

        const currentTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const systemPrompt = GOAL_AI_PROMPT.replace('{CURRENT_TIME}', currentTime);

        const aiRes = await fetch('https://token-plan-cn.xiaomimimo.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: 'mimo-v2.5-pro',
                messages: [{ role: 'system', content: systemPrompt }, ...session.messages],
                temperature: 0.5,
                max_tokens: 2048,
            }),
            signal: AbortSignal.timeout(60000),
        });

        if (!aiRes.ok) {
            const errText = await aiRes.text();
            console.error('AI 目标 API 错误:', aiRes.status, errText);
            return res.status(502).json({ error: 'AI 服务暂时不可用' });
        }

        const aiData = await aiRes.json();
        const reply = aiData.choices?.[0]?.message?.content || '';
        session.messages.push({ role: 'assistant', content: reply });

        // 提取 JSON
        let goal = null;
        try {
            const jsonMatch = reply.match(/```json\s*([\s\S]*?)```/);
            if (jsonMatch) {
                goal = JSON.parse(jsonMatch[1].trim());
            } else {
                const objMatch = reply.match(/\{[\s\S]*\}/);
                if (objMatch) goal = JSON.parse(objMatch[0]);
            }
        } catch {}

        res.json({
            success: true,
            reply: reply.replace(/```json\s*[\s\S]*?```/g, '').replace(/```\s*/g, '').trim(),
            goal,
        });
    } catch (err) {
        console.error('AI 目标创建失败:', err);
        res.status(500).json({ error: '服务器错误: ' + err.message });
    }
});


// PATCH /api/schedules/:id/delay — 延期日程
app.patch('/api/schedules/:id/delay', async (req, res) => {
    try {
        const { newStartTime, newEndTime } = req.body;
        await pool.query(
            'UPDATE schedules SET start_time=?, end_time=? WHERE id=?',
            [newStartTime, newEndTime, req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// AI 复盘教练 API
// ========================================

const reviewSessionCache = new Map();
const REVIEW_SESSION_TTL = 30 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [id, session] of reviewSessionCache) {
        if (now - session.lastActive > REVIEW_SESSION_TTL) reviewSessionCache.delete(id);
    }
}, 5 * 60 * 1000);

const REVIEW_PROMPT_TEMPLATE = `你是一位专业的个人效能教练，名叫MIMO教练。用户会和你讨论他们本周的日程完成情况。

以下是用户本周的数据：
- 总日程: {total}，已完成: {completed}，已取消: {cancelled}，完成率: {rate}%
- 总投入时间: {totalMinutes}分钟
- 分类分布: {byCategory}（各分类的名称、数量、分钟数）
- 时段分布: {byPeriod}（早晨/上午/下午/晚间/深夜的数量）
- 精力分布: {byEnergy}（高/中/低精力的数量）
- 每日时间: {byDay}（周一到周日每天的数量和分钟数）
- 24小时分布: {hourlyDistribution}

你的职责：
1. 首先肯定用户做得好的地方
2. 然后指出需要改进的地方，用数据说话
3. 提出具体、可执行的改进建议（不要泛泛而谈）
4. 用对话方式引导用户思考，语气亲切但专业
5. 回复使用中文，适当使用emoji让对话更生动
6. 保持简洁，每次回复200-400字左右

当前时间：{CURRENT_TIME}`;

// POST /api/ai/review — AI复盘对话
app.post('/api/ai/review', async (req, res) => {
    try {
        const { message, sessionId, startDate } = req.body;
        if (!message || !message.trim()) return res.status(400).json({ error: '请输入复盘内容' });

        const apiKey = process.env.MIMO_API_KEY;
        if (!apiKey || apiKey === 'your-api-key-here') {
            return res.status(500).json({ error: '请先在 .env 文件中配置 MIMO_API_KEY' });
        }

        // 获取本周数据（复用 weekly-report 逻辑）
        const now = new Date();
        const queryDate = startDate || formatDateLocal(now);
        const { monday, sunday } = getWeekRange(queryDate);
        const mondayStr = formatDateLocal(monday);
        const endDate = formatDateLocal(sunday);

        const dayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

        const [overview] = await pool.query(
            `SELECT COUNT(*) as total,
                    SUM(completed) as completedCount,
                    SUM(TIMESTAMPDIFF(MINUTE, start_time, end_time)) as totalMinutes
             FROM schedules WHERE start_time >= ? AND start_time < ?`,
            [mondayStr, endDate]
        );
        let cancelledCount = 0;
        try {
            const [cancelRows] = await pool.query(
                `SELECT SUM(CASE WHEN cancel_reason IS NOT NULL THEN 1 ELSE 0 END) as cancelledCount
                 FROM schedules WHERE start_time >= ? AND start_time < ?`,
                [mondayStr, endDate]
            );
            cancelledCount = cancelRows[0].cancelledCount || 0;
        } catch (e) { /* cancel_reason column doesn't exist yet */ }

        const [byCategory] = await pool.query(
            `SELECT category, COUNT(*) as count,
                    SUM(TIMESTAMPDIFF(MINUTE, start_time, end_time)) as totalMinutes
             FROM schedules WHERE start_time >= ? AND start_time < ?
             GROUP BY category ORDER BY totalMinutes DESC`,
            [mondayStr, endDate]
        );

        const [byDay] = await pool.query(
            `SELECT DATE(start_time) as date, COUNT(*) as count,
                    SUM(TIMESTAMPDIFF(MINUTE, start_time, end_time)) as totalMinutes
             FROM schedules WHERE start_time >= ? AND start_time < ?
             GROUP BY DATE(start_time) ORDER BY date`,
            [mondayStr, endDate]
        );
        const byDayWithLabels = byDay.map(d => ({
            ...d,
            dayLabel: dayLabels[(new Date(d.date).getDay() + 6) % 7]
        }));

        const [byEnergy] = await pool.query(
            `SELECT energy_level, COUNT(*) as count
             FROM schedules WHERE start_time >= ? AND start_time < ?
             GROUP BY energy_level`,
            [mondayStr, endDate]
        );

        const [byPeriod] = await pool.query(
            `SELECT
                CASE
                    WHEN HOUR(start_time) >= 6 AND HOUR(start_time) < 9 THEN 'morning'
                    WHEN HOUR(start_time) >= 9 AND HOUR(start_time) < 12 THEN 'am'
                    WHEN HOUR(start_time) >= 12 AND HOUR(start_time) < 18 THEN 'pm'
                    WHEN HOUR(start_time) >= 18 AND HOUR(start_time) < 22 THEN 'evening'
                    ELSE 'night'
                END as period,
                COUNT(*) as count
             FROM schedules WHERE start_time >= ? AND start_time < ?
             GROUP BY period`,
            [mondayStr, endDate]
        );

        const [hourlyRows] = await pool.query(
            `SELECT HOUR(start_time) as hour, COUNT(*) as count
             FROM schedules WHERE start_time >= ? AND start_time < ?
             GROUP BY HOUR(start_time)`,
            [mondayStr, endDate]
        );
        const hourlyDistribution = Array(24).fill(0);
        hourlyRows.forEach(r => { hourlyDistribution[r.hour] = r.count; });

        const total = overview[0].total || 0;
        const completed = overview[0].completedCount || 0;
        const totalMinutes = overview[0].totalMinutes || 0;
        const rate = total > 0 ? Math.round(completed / total * 100) : 0;

        // 构建 system prompt
        const currentTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        const systemPrompt = REVIEW_PROMPT_TEMPLATE
            .replace('{total}', total)
            .replace('{completed}', completed)
            .replace('{cancelled}', cancelledCount)
            .replace('{rate}', rate)
            .replace('{totalMinutes}', totalMinutes)
            .replace('{byCategory}', JSON.stringify(byCategory))
            .replace('{byPeriod}', JSON.stringify(byPeriod))
            .replace('{byEnergy}', JSON.stringify(byEnergy))
            .replace('{byDay}', JSON.stringify(byDayWithLabels))
            .replace('{hourlyDistribution}', JSON.stringify(hourlyDistribution))
            .replace('{CURRENT_TIME}', currentTime);

        // 获取或创建复盘会话
        const cacheKey = sessionId || 'default-review';
        if (!reviewSessionCache.has(cacheKey)) {
            reviewSessionCache.set(cacheKey, { messages: [], lastActive: Date.now() });
        }
        const session = reviewSessionCache.get(cacheKey);
        session.lastActive = Date.now();

        session.messages.push({ role: 'user', content: message.trim() });
        if (session.messages.length > 12) {
            session.messages = session.messages.slice(-12);
        }

        const payload = {
            model: 'mimo-v2.5-pro',
            messages: [
                { role: 'system', content: systemPrompt },
                ...session.messages
            ],
            temperature: 0.5,
            max_tokens: 4096,
        };

        const aiRes = await fetch('https://token-plan-cn.xiaomimimo.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(60000),
        });

        if (!aiRes.ok) {
            const errText = await aiRes.text();
            console.error('AI Review API 错误:', aiRes.status, errText);
            let errMsg = 'AI 服务暂时不可用，请稍后重试';
            try { const parsed = JSON.parse(errText); errMsg = parsed.error?.message || errMsg; } catch {}
            return res.status(502).json({ error: errMsg });
        }

        const aiData = await aiRes.json();
        const reply = aiData.choices?.[0]?.message?.content || '';

        session.messages.push({ role: 'assistant', content: reply });

        res.json({ success: true, reply });
    } catch (err) {
        console.error('AI 复盘失败:', err);
        if (err.name === 'TimeoutError' || err.code === 'ABORT_ERR') {
            return res.status(504).json({ error: 'AI 响应超时，请稍后重试' });
        }
        res.status(500).json({ error: '服务器错误: ' + err.message });
    }
});

// ========================================
// 情境感知 API
// ========================================

// GET /api/schedules/by-context — 按情境筛选日程
app.get('/api/schedules/by-context', async (req, res) => {
    try {
        const { context } = req.query;
        let query, params;
        if (context) {
            query = `SELECT *, start_time AS start, end_time AS \`end\` FROM schedules WHERE context_type = ? ORDER BY start_time DESC`;
            params = [context];
        } else {
            query = `SELECT *, start_time AS start, end_time AS \`end\` FROM schedules ORDER BY start_time DESC`;
            params = [];
        }
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/weather/alerts — 检测天气与日程冲突
app.get('/api/weather/alerts', async (req, res) => {
    try {
        const city = req.query.city || 'Beijing';
        const now = new Date();
        const threeDaysLater = new Date(now);
        threeDaysLater.setDate(threeDaysLater.getDate() + 3);

        const dateStr = formatDateLocal(now);
        const endStr = formatDateLocal(threeDaysLater);

        // 查询户外日程
        const [outdoorSchedules] = await pool.query(
            `SELECT id, title, start_time FROM schedules
             WHERE context_type = 'outdoor' AND start_time >= ? AND start_time < ?
             ORDER BY start_time`,
            [dateStr, endStr]
        );

        if (outdoorSchedules.length === 0) {
            return res.json({ alerts: [] });
        }

        // 获取天气预报
        const weatherRes = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!weatherRes.ok) return res.status(502).json({ error: '天气服务不可用' });
        const weatherData = await weatherRes.json();

        // 构建日期 -> 天气映射
        const weatherByDate = {};
        (weatherData.weather || []).forEach(day => {
            const avgCode = parseInt(day.hourly?.[4]?.weatherCode || '113');
            const avgTemp = Math.round((parseInt(day.maxtempC) + parseInt(day.mintempC)) / 2);
            const desc = day.hourly?.[4]?.weatherDesc?.[0]?.value || '未知';
            const isBad = (avgCode >= 296 && avgCode <= 399) || (avgCode >= 179 && avgCode <= 199)
                || (avgCode >= 200 && avgCode <= 299) || avgTemp >= 35 || avgTemp <= -10;
            let icon = '☀️';
            if (avgCode >= 179 && avgCode <= 199) icon = '🌨️';
            else if (avgCode >= 200 && avgCode <= 299) icon = '⛈️';
            else if (avgCode >= 296 && avgCode <= 399) icon = '🌧️';
            else if (avgCode === 116) icon = '⛅';
            else if (avgCode === 119 || avgCode === 122) icon = '☁️';
            else if (avgCode === 143 || (avgCode >= 248 && avgCode <= 260)) icon = '🌫️';

            weatherByDate[day.date] = { temp: avgTemp, condition: desc, icon, isBadWeather: isBad };
        });

        // 检查每个户外日程
        const alerts = [];
        for (const s of outdoorSchedules) {
            const sDate = formatDateLocal(new Date(s.start_time));
            const weather = weatherByDate[sDate];
            if (weather && weather.isBadWeather) {
                let suggestion = '建议将此户外活动改为室内进行，或调整到天气更好的时段。';
                if (weather.icon === '🌧️') suggestion = '预报有雨，请携带雨具或考虑改为室内活动。';
                else if (weather.icon === '🌨️') suggestion = '预报有雪，路面可能湿滑，建议改为室内活动。';
                else if (weather.icon === '⛈️') suggestion = '预报有雷暴天气，出于安全考虑建议取消或推迟户外活动。';
                else if (weather.temp >= 35) suggestion = '气温过高，请注意防暑降温，建议调整到早晚时段进行。';
                else if (weather.temp <= -10) suggestion = '气温极低，请注意保暖，建议改为室内活动。';

                alerts.push({
                    scheduleId: s.id,
                    title: s.title,
                    startTime: s.start_time,
                    weather: `${weather.icon} ${weather.condition} ${weather.temp}°C`,
                    suggestion
                });
            }
        }

        res.json({ alerts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// 情绪记录 API
// ========================================

// PATCH /api/schedules/:id/emotion — 记录情绪
app.patch('/api/schedules/:id/emotion', async (req, res) => {
    try {
        const { emotion } = req.body;
        const validEmotions = ['great', 'good', 'neutral', 'tired', 'stressed'];
        if (!validEmotions.includes(emotion)) {
            return res.status(400).json({ error: '无效的情绪值，可选: ' + validEmotions.join(', ') });
        }
        await pool.query(
            'UPDATE schedules SET emotion = ? WHERE id = ?',
            [emotion, req.params.id]
        );
        res.json({ success: true });
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
// 启动服务器
// ========================================
// 全局错误处理
app.use((err, req, res, next) => {
    console.error('[ERROR]', err.message);
    if (!res.headersSent) {
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 记录连接日志
const server = app.listen(PORT, '0.0.0.0', () => {
    server.timeout = 30000;
    server.keepAliveTimeout = 5000;
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║     MIMO TODO 智能日程管理系统          ║');
    console.log('  ╠══════════════════════════════════════════╣');
    console.log(`  ║  本机访问: http://localhost:${PORT}        ║`);
    console.log(`  ║  局域网:   http://172.22.164.119:${PORT}   ║`);
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');
});

server.on('clientError', (err, socket) => {
    console.error('[CLIENT ERROR]', err.message);
    socket.destroy();
});
