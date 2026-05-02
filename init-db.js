const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function initDatabase() {
    console.log('正在连接 MySQL...');

    const conn = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '123456',
        multipleStatements: true,
    });

    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await conn.query(sql);

    console.log('数据库 mimo_todo 初始化成功！');
    await conn.end();
}

initDatabase().catch(err => {
    console.error('初始化失败:', err.message);
    process.exit(1);
});
