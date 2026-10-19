-- Editable baseline tiers for Event Blast. Admins can change reach, duration and BC price.
insert into public.event_blast_plans(id,name,unique_reach,duration_minutes,price_usd,bc_price,enabled)
values
 ('starter','Starter Blast',100,1440,0,100,true),
 ('community','Community Blast',250,1440,0,250,true),
 ('plus','Plus Blast',500,2880,0,500,true),
 ('growth','Growth Blast',1000,4320,0,1000,true),
 ('large','Large Blast',2500,10080,0,2500,true),
 ('max','Max Blast',5000,43200,0,5000,true)
on conflict(id) do nothing;
