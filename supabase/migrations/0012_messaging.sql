-- =========================================================================
-- 0012_messaging.sql
--
-- Patient ↔ clinic messaging. One implicit thread per patient (no separate
-- threads table). Every message names a specific `recipient_id`:
--
--   · Patient → clinician:   recipient_id = that clinician's profile id
--   · Clinician → patient:   recipient_id = the patient's profile id
--
-- All clinicians in the clinic see every message in every patient's thread
-- (so they can step in for each other), but unread state is per-recipient
-- so each clinician only gets pinged for messages addressed to them.
--
-- Realtime is enabled on the table so the chat UI updates without polling.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Schema
-- -------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  sender_role text not null check (sender_role in ('patient', 'clinician')),
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  recipient_read_at timestamptz,
  created_at timestamptz default now() not null
);

create index if not exists messages_patient_created_idx
  on public.messages(patient_id, created_at desc);
create index if not exists messages_clinic_idx
  on public.messages(clinic_id);
create index if not exists messages_recipient_unread_idx
  on public.messages(recipient_id) where recipient_read_at is null;

-- Realtime delivers full new/old rows on update events.
alter table public.messages replica identity full;

-- -------------------------------------------------------------------------
-- RLS
-- -------------------------------------------------------------------------
alter table public.messages enable row level security;

-- SELECT: patient sees own thread; any clinician in clinic sees all threads
-- in their clinic.
drop policy if exists "messages read patient or clinic clinician" on public.messages;
create policy "messages read patient or clinic clinician"
  on public.messages for select
  to authenticated
  using (
    patient_id = auth.uid()
    or (
      public.current_user_role() = 'clinician'
      and clinic_id = public.current_user_clinic()
    )
  );

-- INSERT (patient): must address a message in their own thread, signed by themselves.
drop policy if exists "messages insert patient self" on public.messages;
create policy "messages insert patient self"
  on public.messages for insert
  to authenticated
  with check (
    sender_role = 'patient'
    and sender_id = auth.uid()
    and patient_id = auth.uid()
  );

-- INSERT (clinician): must be in the clinic; sender = self; clinic_id matches own.
drop policy if exists "messages insert clinician in clinic" on public.messages;
create policy "messages insert clinician in clinic"
  on public.messages for insert
  to authenticated
  with check (
    sender_role = 'clinician'
    and sender_id = auth.uid()
    and public.current_user_role() = 'clinician'
    and clinic_id = public.current_user_clinic()
  );

-- UPDATE: only the addressed recipient may touch a row (used for read receipts).
drop policy if exists "messages recipient marks read" on public.messages;
create policy "messages recipient marks read"
  on public.messages for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- No DELETE policy → nobody can delete via the user JWT. Service role bypasses.

-- -------------------------------------------------------------------------
-- Realtime publication
-- -------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end $$;

-- -------------------------------------------------------------------------
-- Patient ↔ clinician profile visibility
--
-- The existing profiles SELECT policy only lets a patient read their own
-- row. For the chat to render sender names and the "to:" picker, a patient
-- needs to see clinicians in their clinic.
-- -------------------------------------------------------------------------
drop policy if exists "patient reads clinic clinicians" on public.profiles;
create policy "patient reads clinic clinicians"
  on public.profiles for select
  to authenticated
  using (
    public.current_user_role() = 'patient'
    and role = 'clinician'
    and clinic_id = public.current_user_clinic()
  );
