USE mimo_todo;

ALTER TABLE schedules ADD COLUMN cancel_reason TEXT DEFAULT NULL AFTER completed_at;
ALTER TABLE schedules ADD COLUMN cancelled_at DATETIME DEFAULT NULL AFTER cancel_reason;
