-- 0024_exercise_video_public_id.sql
-- Stores the Cloudinary public_id alongside the video URL so videos
-- can be managed (deleted/replaced) via the Cloudinary API later.

alter table public.exercise_library
  add column if not exists video_public_id text default null;
