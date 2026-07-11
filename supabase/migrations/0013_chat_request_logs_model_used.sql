-- Records the exact model id that actually answered each chat request (the
-- primary model, or the fallback's id if used_fallback is true), so admins can
-- see which model generated a given response on the /admin/logs page.
alter table chat_request_logs
  add column model_used text;
