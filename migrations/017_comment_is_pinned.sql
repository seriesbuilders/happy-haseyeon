-- 댓글 고정 (랜딩·관리자 공통: 고정 > 추천 > 최신)
ALTER TABLE comments ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
