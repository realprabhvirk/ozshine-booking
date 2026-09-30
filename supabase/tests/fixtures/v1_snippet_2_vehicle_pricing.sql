-- Exactly what was pasted into the live SQL editor for per-vehicle pricing.
alter table vehicles add column if not exists vehicle_type text
  default 'sedan'
  check (vehicle_type in ('sedan', 'small_wagon', 'van', '4wd'));

alter table services add column if not exists price_small_wagon numeric(10,2);
alter table services add column if not exists price_van numeric(10,2);
alter table services add column if not exists price_4wd numeric(10,2);

update services set price_small_wagon = 45,  price_van = 60,  price_4wd = 50  where name = 'OzShine Wash';
update services set price_small_wagon = 75,  price_van = 100, price_4wd = 85  where name = 'Platinum Wash';
update services set price_small_wagon = 140, price_van = 180, price_4wd = 150 where name = 'OzShine Polish';
update services set price_small_wagon = 260, price_van = 300, price_4wd = 280 where name = 'Interior Detail';
update services set price_small_wagon = 350, price_van = 450, price_4wd = 400 where name = 'OzShine Full Detail';
