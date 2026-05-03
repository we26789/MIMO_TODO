const mysql = require('mysql2/promise');

const CATEGORIES = ['work', 'eating', 'exercise', 'study'];
const PRIORITIES = ['low', 'medium', 'high'];
const URGENCIES = ['normal', 'urgent', 'critical'];
const ENERGY_LEVELS = ['high', 'medium', 'low'];
const CONTEXT_TYPES = ['computer', 'phone', 'outdoor', 'meeting', 'anywhere'];

// 日程模板：[标题, 描述, 类别, 优先级, 紧急度, 能量等级, 情境, 时长(分钟)]
const TEMPLATES = [
    // 工作
    ['团队周会', '讨论本周进度和下周计划', 'work', 'high', 'urgent', 'medium', 'meeting', 60],
    ['代码审查', '审查PR并给出反馈', 'work', 'medium', 'normal', 'high', 'computer', 90],
    ['产品需求评审', '评审新版产品需求文档', 'work', 'high', 'critical', 'high', 'meeting', 120],
    ['写周报', '整理本周工作成果', 'work', 'low', 'normal', 'low', 'computer', 30],
    ['客户电话会议', '与客户讨论项目进展', 'work', 'high', 'urgent', 'medium', 'phone', 45],
    ['修复线上Bug', '处理生产环境紧急问题', 'work', 'high', 'critical', 'high', 'computer', 60],
    ['数据库优化', '优化慢查询提升性能', 'work', 'medium', 'normal', 'high', 'computer', 120],
    ['写技术方案', '设计新功能技术方案', 'work', 'medium', 'normal', 'high', 'computer', 90],
    ['站会', '每日15分钟同步进度', 'work', 'low', 'normal', 'low', 'meeting', 15],
    ['面试候选人', '前端开发岗位面试', 'work', 'high', 'urgent', 'medium', 'meeting', 60],
    ['项目进度汇报', '向领导汇报项目状态', 'work', 'high', 'urgent', 'medium', 'meeting', 30],
    ['需求分析', '分析用户反馈并整理需求', 'work', 'medium', 'normal', 'medium', 'computer', 90],
    ['部署新版本', '将代码部署到测试环境', 'work', 'medium', 'urgent', 'medium', 'computer', 45],
    ['编写API文档', '完善接口文档', 'work', 'low', 'normal', 'low', 'computer', 60],
    ['处理工单', '处理用户反馈的技术问题', 'work', 'medium', 'urgent', 'medium', 'computer', 45],
    ['系统架构讨论', '讨论微服务拆分方案', 'work', 'high', 'normal', 'high', 'meeting', 90],
    ['整理工作台', '清理IDE和桌面文件', 'work', 'low', 'normal', 'low', 'computer', 20],
    ['写单元测试', '为核心模块补充测试用例', 'work', 'medium', 'normal', 'medium', 'computer', 60],

    // 吃饭
    ['早餐', '吃早餐补充能量', 'eating', 'low', 'normal', 'low', 'anywhere', 30],
    ['午餐', '和同事一起去食堂', 'eating', 'low', 'normal', 'low', 'anywhere', 45],
    ['晚餐', '回家做饭', 'eating', 'low', 'normal', 'low', 'anywhere', 60],
    ['下午茶', '喝杯咖啡休息一下', 'eating', 'low', 'normal', 'low', 'anywhere', 15],
    ['夜宵', '吃点东西垫垫肚子', 'eating', 'low', 'normal', 'low', 'anywhere', 20],
    ['请客户吃饭', '商务午餐', 'eating', 'high', 'urgent', 'medium', 'outdoor', 90],
    ['朋友聚餐', '大学同学聚会', 'eating', 'medium', 'normal', 'medium', 'outdoor', 120],
    ['周末早午餐', 'Brunch享受慢生活', 'eating', 'low', 'normal', 'low', 'outdoor', 60],
    ['水果加餐', '吃点水果补充维生素', 'eating', 'low', 'normal', 'low', 'anywhere', 10],
    ['营养午餐', '控制饮食保持健康', 'eating', 'low', 'normal', 'low', 'anywhere', 40],
    ['节日晚餐', '家庭节日聚餐', 'eating', 'medium', 'normal', 'medium', 'outdoor', 120],
    ['新餐厅探店', '尝试新开的餐厅', 'eating', 'low', 'normal', 'medium', 'outdoor', 90],
    ['便当准备', '准备明天的午餐便当', 'eating', 'low', 'normal', 'low', 'anywhere', 30],
    ['早餐奶昔', '打一杯水果奶昔', 'eating', 'low', 'normal', 'low', 'anywhere', 10],
    ['火锅之夜', '和朋友吃火锅', 'eating', 'medium', 'normal', 'medium', 'outdoor', 120],

    // 运动
    ['晨跑', '跑步5公里', 'exercise', 'medium', 'normal', 'high', 'outdoor', 40],
    ['健身房力量训练', '上肢力量训练', 'exercise', 'medium', 'normal', 'high', 'outdoor', 60],
    ['瑜伽课', '放松身心的瑜伽', 'exercise', 'low', 'normal', 'low', 'outdoor', 60],
    ['游泳', '自由泳1500米', 'exercise', 'medium', 'normal', 'high', 'outdoor', 45],
    ['骑行', '骑车去公园', 'exercise', 'medium', 'normal', 'medium', 'outdoor', 60],
    ['篮球', '和朋友打篮球', 'exercise', 'medium', 'normal', 'high', 'outdoor', 90],
    ['跳绳', '跳绳1000个', 'exercise', 'low', 'normal', 'medium', 'outdoor', 20],
    ['HIIT训练', '高强度间歇训练', 'exercise', 'high', 'normal', 'high', 'outdoor', 30],
    ['拉伸放松', '运动后拉伸', 'exercise', 'low', 'normal', 'low', 'anywhere', 15],
    ['爬山', '周末爬山活动', 'exercise', 'high', 'normal', 'high', 'outdoor', 180],
    ['羽毛球', '公司羽毛球比赛', 'exercise', 'medium', 'normal', 'high', 'outdoor', 60],
    ['太极拳', '公园打太极', 'exercise', 'low', 'normal', 'low', 'outdoor', 30],
    ['健身操', '跟着视频跳健身操', 'exercise', 'medium', 'normal', 'medium', 'outdoor', 40],
    ['散步', '饭后散步消食', 'exercise', 'low', 'normal', 'low', 'outdoor', 30],
    ['普拉提', '核心力量训练', 'exercise', 'medium', 'normal', 'medium', 'outdoor', 50],

    // 学习
    ['看技术视频', '学习React新特性', 'study', 'medium', 'normal', 'medium', 'computer', 60],
    ['刷LeetCode', '做2道算法题', 'study', 'medium', 'normal', 'high', 'computer', 45],
    ['读技术书', '阅读《设计模式》', 'study', 'low', 'normal', 'medium', 'computer', 60],
    ['在线课程', '完成Coursera课程章节', 'study', 'medium', 'normal', 'medium', 'computer', 90],
    ['背单词', '用Anki背30个新单词', 'study', 'low', 'normal', 'low', 'computer', 20],
    ['写博客', '整理技术博客文章', 'study', 'low', 'normal', 'medium', 'computer', 60],
    ['学英语', '听力练习+阅读', 'study', 'medium', 'normal', 'medium', 'computer', 45],
    ['准备考试', '复习期末考试内容', 'study', 'high', 'urgent', 'high', 'computer', 120],
    ['论文阅读', '阅读3篇学术论文', 'study', 'medium', 'normal', 'high', 'computer', 90],
    ['做笔记', '整理课堂笔记', 'study', 'low', 'normal', 'low', 'computer', 30],
    ['学Python', '练习数据分析脚本', 'study', 'medium', 'normal', 'medium', 'computer', 60],
    ['听播客', '听技术相关播客', 'study', 'low', 'normal', 'low', 'anywhere', 30],
    ['画思维导图', '整理知识体系', 'study', 'low', 'normal', 'medium', 'computer', 40],
    ['模拟面试', '准备技术面试', 'study', 'high', 'urgent', 'high', 'computer', 60],
    ['读书笔记', '写《人类简史》读书笔记', 'study', 'low', 'normal', 'medium', 'computer', 45],
];

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}:00`;
}

function randomHour(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
    console.log('正在连接 MySQL...');
    const conn = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '123456',
        database: 'mimo_todo',
    });

    // 清空现有数据
    await conn.query('DELETE FROM schedules');
    console.log('已清空现有数据');

    const now = new Date();
    const schedules = [];

    for (let i = 0; i < 100; i++) {
        const tpl = TEMPLATES[i % TEMPLATES.length];
        const [title, desc, category, priority, urgency, energy, context, duration] = tpl;

        // 随机日期：今天前15天到后15天
        const dayOffset = Math.floor(Math.random() * 31) - 15;
        const date = new Date(now);
        date.setDate(date.getDate() + dayOffset);

        // 随机开始时间
        let startHour, startMin;
        if (category === 'eating') {
            // 吃饭时间集中
            const mealTimes = [[7, 30], [8, 0], [11, 30], [12, 0], [12, 30], [17, 30], [18, 0], [18, 30], [21, 0], [22, 0]];
            const meal = randomItem(mealTimes);
            startHour = meal[0];
            startMin = meal[1];
        } else if (category === 'exercise') {
            // 运动时间
            startHour = randomItem([6, 7, 8, 16, 17, 18, 19]);
            startMin = randomItem([0, 15, 30, 45]);
        } else if (category === 'study') {
            // 学习时间
            startHour = randomItem([8, 9, 10, 14, 15, 19, 20, 21]);
            startMin = randomItem([0, 30]);
        } else {
            // 工作时间
            startHour = randomHour(8, 17);
            startMin = randomItem([0, 15, 30, 45]);
        }

        date.setHours(startHour, startMin, 0, 0);
        const start = new Date(date);
        const end = new Date(date);
        end.setMinutes(end.getMinutes() + duration);

        const completed = Math.random() < 0.3 ? 1 : 0;
        const completedAt = completed ? formatDate(new Date(start.getTime() + duration * 60000 * Math.random())) : null;

        schedules.push({
            id: generateId() + i,
            title,
            description: desc,
            start: formatDate(start),
            end: formatDate(end),
            priority,
            urgency,
            category,
            energy_level: energy,
            context_type: context,
            completed,
            completed_at: completedAt,
        });
    }

    // 批量插入
    const sql = `INSERT INTO schedules (id, title, description, start_time, end_time, priority, urgency, category, energy_level, context_type, completed, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    for (const s of schedules) {
        await conn.query(sql, [
            s.id, s.title, s.description, s.start, s.end,
            s.priority, s.urgency, s.category, s.energy_level, s.context_type,
            s.completed, s.completed_at,
        ]);
    }

    console.log(`成功插入 ${schedules.length} 条日程数据`);
    await conn.end();
}

seed().catch(err => {
    console.error('种子数据插入失败:', err.message);
    process.exit(1);
});
