USE mimo_todo;

-- ========================================
-- 目标模块升级 V2
-- ========================================

-- 1. 更新goals表的type字段，添加yearly和daily
-- 先删除外键约束（如果有），再修改ENUM
SET @db = (SELECT DATABASE());
SET @sql = CONCAT('ALTER TABLE goals MODIFY COLUMN type ENUM(''yearly'', ''quarterly'', ''monthly'', ''weekly'', ''daily'') DEFAULT ''monthly''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 添加弹性调度字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'goals' AND column_name = 'is_flexible');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE goals ADD COLUMN is_flexible TINYINT(1) DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'goals' AND column_name = 'flexible_days');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE goals ADD COLUMN flexible_days INT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 添加取消相关字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'goals' AND column_name = 'cancel_reason');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE goals ADD COLUMN cancel_reason TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'goals' AND column_name = 'cancelled_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE goals ADD COLUMN cancelled_at DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. 添加成果字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'goals' AND column_name = 'achievements');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE goals ADD COLUMN achievements JSON DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. 更新打卡相关字段
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'goals' AND column_name = 'checkin_start_time');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE goals ADD COLUMN checkin_start_time TIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'goals' AND column_name = 'checkin_end_time');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE goals ADD COLUMN checkin_end_time TIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 6. 更新goals表状态枚举，添加cancelled
SET @sql = 'ALTER TABLE goals MODIFY COLUMN status ENUM(''active'', ''completed'', ''abandoned'', ''cancelled'') DEFAULT ''active''';
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 7. 添加每日打卡记录的完成状态
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'goal_checkins' AND column_name = 'status');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE goal_checkins ADD COLUMN status ENUM(''normal'', ''late'', ''missed'') DEFAULT ''normal''', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = @db AND table_name = 'goal_checkins' AND column_name = 'checkin_time');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE goal_checkins ADD COLUMN checkin_time DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
