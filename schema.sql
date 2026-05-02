-- ========================================
-- MIMO TODO 智能日程管理 - 数据库初始化
-- ========================================

CREATE DATABASE IF NOT EXISTS mimo_todo
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE mimo_todo;

DROP TABLE IF EXISTS schedules;

CREATE TABLE schedules (
    id           VARCHAR(30)  PRIMARY KEY,
    title        VARCHAR(255) NOT NULL,
    description  TEXT,
    start_time   DATETIME     NOT NULL,
    end_time     DATETIME     NOT NULL,
    priority     ENUM('low', 'medium', 'high')   DEFAULT 'low',
    urgency      ENUM('normal', 'urgent', 'critical') DEFAULT 'normal',
    category     ENUM('work', 'personal', 'family', 'health') DEFAULT 'work',
    energy_level ENUM('high', 'medium', 'low')   DEFAULT 'medium',
    context_type ENUM('computer', 'phone', 'outdoor', 'meeting', 'anywhere') DEFAULT 'anywhere',
    completed    TINYINT(1)   DEFAULT 0,
    completed_at DATETIME     DEFAULT NULL,
    achievements JSON         DEFAULT NULL,
    created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FULLTEXT INDEX idx_search (title, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
