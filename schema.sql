-- ========================================
-- MIMO TODO 智能日程管理 - 数据库初始化
-- ========================================

CREATE DATABASE IF NOT EXISTS mimo_todo
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE mimo_todo;

DROP TABLE IF EXISTS schedules;

CREATE TABLE schedules (
    id          VARCHAR(30)  PRIMARY KEY,
    title       VARCHAR(255) NOT NULL,
    description TEXT,
    start_time  DATETIME     NOT NULL,
    end_time    DATETIME     NOT NULL,
    priority    ENUM('low', 'medium', 'high')   DEFAULT 'low',
    urgency     ENUM('normal', 'urgent', 'critical') DEFAULT 'normal',
    completed   TINYINT(1)   DEFAULT 0,
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_start (start_time),
    INDEX idx_completed (completed),
    INDEX idx_priority (priority),
    INDEX idx_urgency (urgency)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
