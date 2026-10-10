-- ARWAYS TMS: complete account details on users.
-- Phone for all roles (driver contact, dispatcher callbacks);
-- license_no for drivers (LTO license on file).

alter table users add column if not exists phone text;
alter table users add column if not exists license_no text;
