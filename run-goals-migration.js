const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    console.log('正在连接 MySQL...');

    const conn = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '123456',
        multipleStatements: true,
    });

    const sql = fs.readFileSync(path.join(__dirname, 'migration-goals-v2.sql'), 'utf-8');
    await conn.query(sql);

    console.log('目标模块 V2 迁移成功！');
    await conn.end();
}

runMigration().catch(err => {
    console.error('迁移失败:', err.message);
    process.exit(1);
});
