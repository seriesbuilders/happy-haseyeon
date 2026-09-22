-- 관리자 작성 댓글(1) vs 랜딩(방문자) 작성 댓글(0)
ALTER TABLE comments ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
