-- ========================================
-- MIMO TODO - 数据库迁移（新增视角字段）
-- ========================================

USE mimo_todo;

-- 意图视图: 角色/目标分类
ALTER TABLE schedules
  ADD COLUMN category ENUM('work','personal','family','health') DEFAULT 'work'
  AFTER urgency;

-- 能量视图: 任务能量等级
ALTER TABLE schedules
  ADD COLUMN energy_level ENUM('high','medium','low') DEFAULT 'medium'
  AFTER category;

-- 情境视图: 工具/地点标记
ALTER TABLE schedules
  ADD COLUMN context_type ENUM('computer','phone','outdoor','meeting','anywhere') DEFAULT 'anywhere'
  AFTER energy_level;
