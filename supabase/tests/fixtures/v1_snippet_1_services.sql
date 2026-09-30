-- Exactly what was pasted into the live SQL editor after the Phase 5 schema:
-- adds the three extra services and re-orders Full Detail.
insert into services (location_id, name, price_from, description, sort_order)
select l.id, 'OzShine Polish', 120.00, 'A restorative exterior service using clay bar treatment and professional polishing to restore paint clarity.', 3
from locations l
where l.name = 'OzShine Hand Car Wash — Beenleigh'
  and not exists (select 1 from services s where s.location_id = l.id and s.name = 'OzShine Polish');

insert into services (location_id, name, price_from, description, sort_order)
select l.id, 'Interior Detail', 240.00, 'A deep restorative clean for seats, carpets, mats and all the cabin surfaces that shape the driving experience.', 4
from locations l
where l.name = 'OzShine Hand Car Wash — Beenleigh'
  and not exists (select 1 from services s where s.location_id = l.id and s.name = 'Interior Detail');

insert into services (location_id, name, price_from, description, sort_order)
select l.id, 'Correction & Coating', 330.00, 'For drivers chasing deeper gloss and more durable surface protection — corrects clear coat imperfections and adds ceramic protection to exterior and interior surfaces.', 6
from locations l
where l.name = 'OzShine Hand Car Wash — Beenleigh'
  and not exists (select 1 from services s where s.location_id = l.id and s.name = 'Correction & Coating');

update services set sort_order = 5
where name = 'OzShine Full Detail'
  and location_id = (select id from locations where name = 'OzShine Hand Car Wash — Beenleigh');
