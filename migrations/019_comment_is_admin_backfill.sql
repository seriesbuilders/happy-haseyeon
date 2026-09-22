-- 기존 댓글은 관리자 작성분이므로 is_admin=1로 보정
UPDATE comments SET is_admin = 1 WHERE is_admin = 0 OR is_admin IS NULL;
