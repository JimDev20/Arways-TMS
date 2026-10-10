-- ARWAYS TMS: order priority (Normal / Urgent / Rush) per PRD 5.6.
-- Existing orders default to Normal.

alter table orders add column if not exists priority text not null default 'Normal';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_priority_check') then
    alter table orders add constraint orders_priority_check check (priority in ('Normal', 'Urgent', 'Rush'));
  end if;
end $$;
