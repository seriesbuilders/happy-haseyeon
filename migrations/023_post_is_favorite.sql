-- 관리자 즐겨찾기 (1=즐겨찾기, 0=아님). 광고 블로그 목록에서 원본 글을 빨리 찾기 위한 표시
-- (배포된 서버에서는 functions/_utils.js 의 ensurePostsColumns 가 자동으로 추가하므로, 이 파일은 기록용)
ALTER TABLE posts ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;
