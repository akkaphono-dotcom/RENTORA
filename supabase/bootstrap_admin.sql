-- Run this once in the Supabase SQL Editor after this address has signed up
-- and confirmed its email. This grants the first Admin role.
insert into public.user_roles (user_id, role)
select id, 'admin'
from auth.users
where lower(email) = lower('akkaphon.a17@gmail.com')
  and email_confirmed_at is not null
on conflict do nothing;

select u.email, r.role
from auth.users u
join public.user_roles r on r.user_id = u.id
where lower(u.email) = lower('akkaphon.a17@gmail.com');
