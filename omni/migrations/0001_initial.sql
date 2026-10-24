CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE tasks (id TEXT PRIMARY KEY, kind TEXT NOT NULL, objective TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL, result TEXT, error TEXT, steps TEXT NOT NULL DEFAULT '[]', usage TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE audit (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, target TEXT, created INTEGER NOT NULL);
CREATE INDEX tasks_created ON tasks(created DESC);
CREATE INDEX audit_created ON audit(created);
