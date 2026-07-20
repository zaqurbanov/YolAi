-- Reverts 0054_chat_images.sql: user-uploaded chat images are no longer
-- persisted at all. Decision (confirmed with the user): a photo attached in
-- chat is processed in-memory for the vision identification call
-- (lib/rag/identifySignFromImage.ts) only — it's never written to Storage or
-- the database. The image still displays normally for the duration of the
-- live session (useChat's own local message state), it just doesn't survive
-- a reload/revisit. Simpler, and avoids retaining potentially sensitive user
-- photos indefinitely.
alter table messages drop column if exists image_path;

delete from storage.buckets where id = 'chat-images';
