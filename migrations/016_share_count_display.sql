-- 반응바 공유 표시 수 (관리자 수동 설정)
ALTER TABLE posts ADD COLUMN share_count_display INTEGER NOT NULL DEFAULT 0;
