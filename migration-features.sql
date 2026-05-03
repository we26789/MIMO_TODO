USE mimo_todo;

-- ========================================
-- 目标管理
-- ========================================
CREATE TABLE IF NOT EXISTS goals (
    id VARCHAR(30) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type ENUM('quarterly', 'monthly', 'weekly') DEFAULT 'monthly',
    target_category VARCHAR(50) DEFAULT NULL,
    target_minutes INT DEFAULT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status ENUM('active', 'completed', 'abandoned') DEFAULT 'active',
    progress INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS goal_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    goal_id VARCHAR(30) NOT NULL,
    schedule_id VARCHAR(30) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_binding (goal_id, schedule_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ========================================
-- 日程新增字段
-- ========================================
ALTER TABLE schedules ADD COLUMN emotion ENUM('great', 'good', 'neutral', 'tired', 'stressed') DEFAULT NULL;
ALTER TABLE schedules ADD COLUMN is_flexible TINYINT(1) DEFAULT 0;
ALTER TABLE schedules ADD COLUMN flexible_deadline DATETIME DEFAULT NULL;
ALTER TABLE schedules ADD COLUMN estimated_minutes INT DEFAULT NULL;

-- ========================================
-- 目标打卡
-- ========================================
CREATE TABLE IF NOT EXISTS goal_checkins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    goal_id VARCHAR(30) NOT NULL,
    checkin_date DATE NOT NULL,
    note TEXT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_checkin (goal_id, checkin_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE goals ADD COLUMN IF NOT EXISTS checkin_required TINYINT(1) DEFAULT 1;
ALTER TABLE goals ADD COLUMN IF NOT EXISTS checkin_remind TINYINT(1) DEFAULT 1;
