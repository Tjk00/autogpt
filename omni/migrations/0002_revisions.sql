ALTER TABLE tasks ADD COLUMN parent_id TEXT REFERENCES tasks(id);
CREATE INDEX tasks_status_updated ON tasks(status, updated);
CREATE INDEX sessions_expires ON sessions(expires);
CREATE INDEX rate_expires ON rate_limits(expires);
