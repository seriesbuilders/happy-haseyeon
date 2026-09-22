-- 비밀 댓글 (1=비밀, 0=공개)
ALTER TABLE comments ADD COLUMN is_secret INTEGER NOT NULL DEFAULT 0;
