-- RENTORA core schema. Apply with Supabase CLI or the SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  line_id text not null default '',
  bio text not null default '',
  avatar_url text not null default '',
  avatar_color text not null default 'bg-indigo-600',
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  owner_email text not null,
  owner_name text not null,
  owner_phone text not null default '',
  owner_line text not null default '',
  owner_avatar_url text not null default '',
  owner_avatar_color text not null default 'bg-indigo-600',
  title text not null,
  type text not null check (type in ('บ้าน', 'คอนโด', 'ทาวน์โฮม')),
  price numeric(12,2) not null check (price >= 0),
  location text not null,
  map_url text not null default '',
  image_url text not null default '',
  description text not null default '',
  status text not null default 'Available' check (status in ('Available', 'Unavailable', 'Archived')),
  publication_status text not null default 'PendingReview' check (publication_status in ('PendingReview', 'Published', 'Rejected')),
  verification_status text not null default 'Pending' check (verification_status in ('Pending', 'Approved', 'Rejected')),
  verification_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_verifications (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  submitted_by uuid references auth.users(id) on delete set null,
  document_type text not null check (document_type in ('Ownership', 'Authorization')),
  document_path text not null unique,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Replaced')),
  review_note text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.rental_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid references auth.users(id) on delete set null,
  tenant_email text not null,
  tenant_name text not null,
  property_title text not null,
  move_in_date date not null,
  message text not null default '',
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete set null,
  property_title text not null,
  tenant_id uuid references auth.users(id) on delete set null,
  tenant_email text not null,
  tenant_name text not null,
  owner_id uuid references auth.users(id) on delete set null,
  owner_email text not null,
  owner_name text not null,
  unread_tenant integer not null default 0 check (unread_tenant >= 0),
  unread_owner integer not null default 0 check (unread_owner >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, tenant_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_email text not null,
  sender_name text not null,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists properties_public_search_idx on public.properties(publication_status, status, type, price, created_at desc);
create index if not exists properties_owner_idx on public.properties(owner_id, created_at desc);
create index if not exists property_verifications_queue_idx on public.property_verifications(status, created_at);
create index if not exists property_verifications_property_idx on public.property_verifications(property_id, created_at desc);
create index if not exists requests_tenant_idx on public.rental_requests(tenant_id, created_at desc);
create index if not exists requests_property_idx on public.rental_requests(property_id, created_at desc);
create unique index if not exists rental_request_one_pending_per_tenant_property
  on public.rental_requests(property_id, tenant_id) where status = 'Pending' and tenant_id is not null;
create index if not exists conversations_tenant_idx on public.conversations(tenant_id, updated_at desc);
create index if not exists conversations_owner_idx on public.conversations(owner_id, updated_at desc);
create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and suspended_at is null
  );
$$;

create or replace function public.is_phone_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where id = (select auth.uid())
      and phone is not null
      and phone_confirmed_at is not null
  );
$$;
revoke all on function public.is_phone_verified() from public, anon;
grant execute on function public.is_phone_verified() to authenticated;

create or replace function public.invalidate_listing_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(new.title, new.type, new.price, new.location, new.map_url, new.image_url, new.description,
         new.owner_name, new.owner_phone, new.owner_line)
     is distinct from
     row(old.title, old.type, old.price, old.location, old.map_url, old.image_url, old.description,
         old.owner_name, old.owner_phone, old.owner_line) then
    new.publication_status := 'PendingReview';
    new.verification_status := 'Pending';
    new.verification_note := '';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_verified_listing_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_phone text;
begin
  select phone into verified_phone from auth.users
    where id = new.owner_id and phone is not null and phone_confirmed_at is not null;
  if verified_phone is null then
    raise exception 'A verified phone number is required to publish a listing';
  end if;
  new.owner_phone := verified_phone;
  return new;
end;
$$;

create trigger properties_use_verified_phone_on_insert
  before insert on public.properties
  for each row execute function public.enforce_verified_listing_phone();
create trigger properties_use_verified_phone_on_update
  before update of owner_phone on public.properties
  for each row execute function public.enforce_verified_listing_phone();

create trigger properties_require_reverification
  before update of title, type, price, location, map_url, image_url, description, owner_name, owner_phone, owner_line
  on public.properties
  for each row execute function public.invalidate_listing_verification();

create or replace function public.prepare_property_verification_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.property_verifications
    set status = 'Replaced'
    where property_id = new.property_id and status = 'Pending';
  update public.properties
    set publication_status = 'PendingReview', verification_status = 'Pending', verification_note = ''
    where id = new.property_id and owner_id = new.submitted_by;
  return new;
end;
$$;

create trigger property_verification_submission_refreshes_listing
  before insert on public.property_verifications
  for each row execute function public.prepare_property_verification_submission();

create or replace function public.review_property_verification(
  target_verification_id uuid,
  approve_listing boolean,
  review_note_input text,
  reviewer_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  verification public.property_verifications%rowtype;
  listing public.properties%rowtype;
begin
  if not exists (select 1 from public.user_roles where user_id = reviewer_id and role = 'admin') then
    raise exception 'Administrator access required';
  end if;
  if char_length(coalesce(review_note_input, '')) > 1000 then
    raise exception 'Review note is too long';
  end if;

  select * into verification from public.property_verifications
    where id = target_verification_id for update;
  if not found or verification.status <> 'Pending' then
    raise exception 'Verification request is no longer pending';
  end if;
  select * into listing from public.properties where id = verification.property_id for update;
  if not found or listing.owner_id is null or listing.status = 'Archived' then
    raise exception 'Listing is no longer available for review';
  end if;
  if verification.submitted_by is distinct from listing.owner_id
     or listing.publication_status not in ('PendingReview', 'Rejected') then
    raise exception 'Verification request does not match a listing awaiting review';
  end if;
  if not exists (
    select 1 from auth.users
    where id = listing.owner_id and phone is not null and phone_confirmed_at is not null
  ) then
    raise exception 'The listing owner must verify a phone number first';
  end if;

  update public.property_verifications
    set status = case when approve_listing then 'Approved' else 'Rejected' end,
        review_note = coalesce(review_note_input, ''), reviewed_by = reviewer_id, reviewed_at = now()
    where id = verification.id;
  update public.properties
    set publication_status = case when approve_listing then 'Published' else 'Rejected' end,
        verification_status = case when approve_listing then 'Approved' else 'Rejected' end,
        verification_note = coalesce(review_note_input, ''), updated_at = now()
    where id = listing.id;
end;
$$;
revoke all on function public.review_property_verification(uuid, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.review_property_verification(uuid, boolean, text, uuid) to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.properties enable row level security;
alter table public.property_verifications enable row level security;
alter table public.rental_requests enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on public.profiles, public.user_roles, public.properties,
  public.property_verifications, public.rental_requests, public.conversations, public.messages from anon, authenticated;
grant all on public.profiles, public.user_roles, public.properties,
  public.property_verifications, public.rental_requests, public.conversations, public.messages to service_role;
grant select on public.properties to anon, authenticated;
grant select, insert on public.property_verifications to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, line_id, bio, avatar_url, avatar_color, updated_at) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant insert (owner_id, owner_email, owner_name, owner_phone, owner_line, owner_avatar_url, owner_avatar_color,
  title, type, price, location, map_url, image_url, description, status) on public.properties to authenticated;
grant update (owner_name, owner_phone, owner_line, owner_avatar_url, owner_avatar_color, title, type, price,
  location, map_url, image_url, description, status, updated_at) on public.properties to authenticated;
grant select, insert on public.rental_requests to authenticated;
grant update (status, updated_at) on public.rental_requests to authenticated;
grant select on public.conversations to authenticated;
grant insert (property_id, property_title, tenant_id, tenant_email, tenant_name, owner_id, owner_email, owner_name)
  on public.conversations to authenticated;
grant select on public.messages to authenticated;

create policy "Read active or owned properties"
  on public.properties for select to anon, authenticated
  using ((status = 'Available' and publication_status = 'Published') or (owner_id = (select auth.uid()) and (select public.is_active_user())) or (select public.is_admin()));
create policy "Owners create their own listings"
  on public.properties for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and owner_email = ((select auth.jwt()) ->> 'email')
    and (select public.is_active_user())
    and (select public.is_phone_verified())
  );
create policy "Owners update their own listings"
  on public.properties for update to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_active_user()))
  with check (owner_id = (select auth.uid()) and (select public.is_active_user()));

create policy "Listing owners read their verification history"
  on public.property_verifications for select to authenticated
  using (
    submitted_by = (select auth.uid())
    or exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
  );
create policy "Verified owners submit listing documents"
  on public.property_verifications for insert to authenticated
  with check (
    submitted_by = (select auth.uid())
    and (select public.is_active_user())
    and (select public.is_phone_verified())
    and (storage.foldername(document_path))[1] = (select auth.uid())::text
    and (storage.foldername(document_path))[2] = property_id::text
    and exists (
      select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid())
        and p.status <> 'Archived' and p.publication_status in ('PendingReview', 'Rejected')
    )
  );

create policy "Read own profile"
  on public.profiles for select to authenticated
  using ((id = (select auth.uid()) and (select public.is_active_user())) or (select public.is_admin()));
create policy "Create own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "Update own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and suspended_at is null)
  with check (id = (select auth.uid()) and suspended_at is null);

create policy "Read own admin role"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Participants read rental requests"
  on public.rental_requests for select to authenticated
  using (
    ((select public.is_active_user()) and (
      tenant_id = (select auth.uid())
      or exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
    ))
    or (select public.is_admin())
  );
create policy "Active users create rental requests"
  on public.rental_requests for insert to authenticated
  with check (
    tenant_id = (select auth.uid())
    and tenant_email = ((select auth.jwt()) ->> 'email')
    and tenant_name = (select full_name from public.profiles where id = (select auth.uid()))
    and status = 'Pending'
    and (select public.is_active_user())
    and exists (
      select 1 from public.properties p
       where p.id = property_id and p.status = 'Available' and p.publication_status = 'Published' and p.owner_id <> (select auth.uid())
        and p.title = property_title
    )
  );
create policy "Owners update rental request status"
  on public.rental_requests for update to authenticated
  using (
    status = 'Pending' and (select public.is_active_user())
    and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
  )
  with check (
    status = 'Rejected'
    and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
  );

create or replace function public.approve_rental_request(target_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.rental_requests%rowtype;
  listing public.properties%rowtype;
begin
  if (select auth.uid()) is null or not (select public.is_active_user()) then
    raise exception 'Active sign-in required';
  end if;
  select * into target from public.rental_requests where id = target_request_id for update;
  if not found then raise exception 'Request not found'; end if;
  select * into listing from public.properties where id = target.property_id for update;
  if not found or listing.owner_id <> (select auth.uid()) then
    raise exception 'Only the listing owner can approve this request';
  end if;
  if target.status <> 'Pending' or listing.status <> 'Available' or listing.publication_status <> 'Published' or target.tenant_id = (select auth.uid()) then
    raise exception 'Request or listing is no longer available';
  end if;
  update public.rental_requests set status = 'Approved', updated_at = now() where id = target.id;
  update public.properties set status = 'Unavailable', updated_at = now() where id = listing.id;
  update public.rental_requests set status = 'Rejected', updated_at = now()
    where property_id = listing.id and id <> target.id and status = 'Pending';
end;
$$;
revoke all on function public.approve_rental_request(uuid) from public;
grant execute on function public.approve_rental_request(uuid) to authenticated;

create or replace function public.send_chat_message(target_conversation_id uuid, message_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread public.conversations%rowtype;
  sender_name_value text;
  sender_email_value text;
begin
  if (select auth.uid()) is null or not (select public.is_active_user()) then
    raise exception 'Active sign-in required';
  end if;
  if char_length(message_body) not between 1 and 5000 then raise exception 'Invalid message length'; end if;
  select * into thread from public.conversations
    where id = target_conversation_id and ((select auth.uid()) = tenant_id or (select auth.uid()) = owner_id)
    for update;
  if not found then raise exception 'Conversation not found'; end if;
  if thread.tenant_id is null or thread.owner_id is null then raise exception 'The other account no longer exists'; end if;
  sender_email_value := (select auth.jwt()) ->> 'email';
  select full_name into sender_name_value from public.profiles where id = (select auth.uid());
  insert into public.messages (conversation_id, sender_id, sender_email, sender_name, body)
    values (thread.id, (select auth.uid()), sender_email_value, coalesce(sender_name_value, sender_email_value), message_body);
  if thread.tenant_id = (select auth.uid()) then
    update public.conversations set unread_owner = unread_owner + 1, updated_at = now() where id = thread.id;
  else
    update public.conversations set unread_tenant = unread_tenant + 1, updated_at = now() where id = thread.id;
  end if;
end;
$$;
revoke all on function public.send_chat_message(uuid, text) from public;
grant execute on function public.send_chat_message(uuid, text) to authenticated;

create or replace function public.mark_chat_read(target_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread public.conversations%rowtype;
begin
  if (select auth.uid()) is null or not (select public.is_active_user()) then
    raise exception 'Active sign-in required';
  end if;
  select * into thread from public.conversations
    where id = target_conversation_id and ((select auth.uid()) = tenant_id or (select auth.uid()) = owner_id)
    for update;
  if not found then raise exception 'Conversation not found'; end if;
  if thread.tenant_id = (select auth.uid()) then
    update public.conversations set unread_tenant = 0 where id = thread.id;
  else
    update public.conversations set unread_owner = 0 where id = thread.id;
  end if;
end;
$$;
revoke all on function public.mark_chat_read(uuid) from public;
grant execute on function public.mark_chat_read(uuid) to authenticated;

create policy "Conversation participants read"
  on public.conversations for select to authenticated
  using (((select public.is_active_user()) and (tenant_id = (select auth.uid()) or owner_id = (select auth.uid()))) or (select public.is_admin()));
create policy "Participants start conversations"
  on public.conversations for insert to authenticated
  with check (
    (select public.is_active_user())
    and (
      (
        public.conversations.tenant_id = (select auth.uid())
        and public.conversations.owner_id <> (select auth.uid())
        and public.conversations.tenant_email = ((select auth.jwt()) ->> 'email')
        and public.conversations.tenant_name = (select full_name from public.profiles where id = (select auth.uid()))
        and exists (
          select 1 from public.properties p where p.id = public.conversations.property_id
            and p.owner_id = public.conversations.owner_id and p.status <> 'Archived' and p.publication_status = 'Published'
            and p.owner_email = public.conversations.owner_email and p.owner_name = public.conversations.owner_name
            and p.title = public.conversations.property_title
        )
      )
      or (
        public.conversations.owner_id = (select auth.uid())
        and public.conversations.owner_email = ((select auth.jwt()) ->> 'email')
        and exists (
          select 1 from public.properties p where p.id = public.conversations.property_id
            and p.owner_id = (select auth.uid()) and p.status <> 'Archived' and p.publication_status = 'Published'
            and p.title = public.conversations.property_title
        )
        and exists (
          select 1 from public.rental_requests r where r.property_id = public.conversations.property_id
            and r.tenant_id = public.conversations.tenant_id
            and r.tenant_email = public.conversations.tenant_email
            and r.tenant_name = public.conversations.tenant_name
        )
      )
    )
  );
create policy "Conversation participants read messages"
  on public.messages for select to authenticated
  using (exists (
    select 1 from public.conversations c where c.id = conversation_id
      and (select public.is_active_user())
      and (c.tenant_id = (select auth.uid()) or c.owner_id = (select auth.uid()))
  ) or (select public.is_admin()));
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('property-images', 'property-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp']),
  ('verification-documents', 'verification-documents', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Public read RENTORA images" on storage.objects for select to public
  using (bucket_id in ('property-images', 'avatars'));
create policy "Users upload RENTORA images to their folder" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('property-images', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active_user())
  );
create policy "Users update RENTORA images in their folder" on storage.objects for update to authenticated
  using (
    bucket_id in ('property-images', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active_user())
  )
  with check (
    bucket_id in ('property-images', 'avatars')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Users delete RENTORA images in their folder" on storage.objects for delete to authenticated
  using (bucket_id in ('property-images', 'avatars') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Listing owners upload private verification documents" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active_user())
    and (select public.is_phone_verified())
  );
create policy "Listing owners read their private verification documents" on storage.objects for select to authenticated
  using (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_active_user())
  );
create policy "Listing owners delete their private verification documents" on storage.objects for delete to authenticated
  using (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.property_verifications v where v.document_path = storage.objects.name
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
      alter publication supabase_realtime add table public.messages;
    end if;
  end if;
end;
$$;

-- After the first Admin address signs up and confirms email, promote that user once:
-- insert into public.user_roles (user_id, role)
-- select id, 'admin' from auth.users where lower(email) = lower('akkaphon.a17@gmail.com')
-- on conflict do nothing;
