#!/bin/bash
set -e
npm install

# Ensure new tables/columns exist before db:push to avoid interactive prompts
psql "$DATABASE_URL" -c "
  CREATE TABLE IF NOT EXISTS pinned_findings (
    id SERIAL PRIMARY KEY,
    admin_user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    note TEXT DEFAULT '',
    pinned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
  );
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stuck_acknowledged_at TIMESTAMP;
  ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stuck_acknowledged_by INTEGER;
"

npm run db:push
