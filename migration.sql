USE mimo_todo;

-- 先更新已有数据到新值
UPDATE schedules SET category='eating' WHERE category='personal';
UPDATE schedules SET category='exercise' WHERE category='family';
UPDATE schedules SET category='study' WHERE category='health';

-- 再修改枚举值
ALTER TABLE schedules MODIFY COLUMN category ENUM('work','eating','exercise','study') DEFAULT 'work';
