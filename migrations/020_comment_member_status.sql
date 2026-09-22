-- 회원 댓글 소유자 + 상태 (active | deleted)
ALTER TABLE comments ADD COLUMN member_id INTEGER;
ALTER TABLE comments ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
