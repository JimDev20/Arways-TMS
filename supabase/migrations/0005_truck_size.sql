-- ARWAYS TMS: truck size class (4W / 6W / 10W wheelers).
-- Existing trucks default to 6W; correct per-truck from Fleet afterwards.

alter table trucks add column if not exists truck_size text not null default '6W';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'trucks_size_check') then
    alter table trucks add constraint trucks_size_check check (truck_size in ('4W', '6W', '10W'));
  end if;
end $$;
