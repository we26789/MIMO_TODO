require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

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
// 中间件
// ========================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
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
        const [byContext] = await pool.query(
            `SELECT context_type, COUNT(*) as count FROM schedules GROUP BY context_type`
        );
        res.json({ byCategory, byEnergy, byContext });
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
        const weatherRes = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
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

const SYSTEM_PROMPT = `你是一个智能日程助手。用户会用自然语言描述日程需求，你需要解析并返回结构化的日程数据。

当前时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

## 输出规则

返回一个 JSON 数组，每个元素代表一个日程，格式如下：
\`\`\`json
[{
  "title": "日程标题（简洁明确）",
  "description": "日程描述（可选，没有则为空字符串）",
  "start": "2026-05-03T14:00",
  "end": "2026-05-03T16:00",
  "priority": "low|medium|high",
  "urgency": "normal|urgent|critical",
  "category": "work|personal|family|health",
  "energy_level": "high|medium|low",
  "context_type": "computer|phone|outdoor|meeting|anywhere"
}]
\`\`\`

## 时间解析规则

- "明天下午2点" → 根据当前时间计算具体日期和时间
- "下周三上午9点到11点" → 计算下周三的具体日期
- "2小时后" → 从当前时间开始算
- "这周五" → 计算最近的周五
- "每天晚上8点" → 创建今天起的一个日程
- 如果只给了开始时间没给结束时间，默认持续2小时
- 所有时间使用 24 小时制，格式为 YYYY-MM-DDTHH:MM

## 优先级和紧急程度推断

- 高优先级: 考试、面试、截止日期、重要会议
- 中优先级: 普通会议、约会、定期任务
- 低优先级: 休闲、日常琐事
- 非常紧急(critical): 马上要发生的、逾期的
- 紧急(urgent): 今天或明天内需要完成的
- 一般(normal): 未来几天的安排

## 类别推断 (category)

- 工作(work): 工作任务、会议、项目、汇报、办公相关
- 个人成长(personal): 学习、阅读、培训、技能提升、兴趣爱好
- 家庭(family): 家庭聚会、陪伴家人、家务、家庭事务
- 健康(health): 运动、健身、体检、看病、养生

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

- 如果用户描述模糊，基于常识合理推断
- 一次可以创建多个日程（如"帮我安排下周的会议"）
- 回复时先简要说明你理解了什么，然后附上 JSON
- JSON 必须包裹在 \`\`\`json 和 \`\`\` 代码块中
- title 不能为空，必须是用户能理解的中文标题`;

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

        const payload = {
            model: 'mimo-v2.5-pro',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                ...session.messages
            ],
            temperature: 0.3,
            max_tokens: 2048,
        };

        const aiRes = await fetch('https://token-plan-cn.xiaomimimo.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
        });

        if (!aiRes.ok) {
            const errText = await aiRes.text();
            console.error('AI API 错误:', aiRes.status, errText);
            return res.status(502).json({ error: 'AI 服务暂时不可用，请稍后重试' });
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
