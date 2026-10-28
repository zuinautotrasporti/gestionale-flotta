-- =====================================================================
--  GESTIONALE FLOTTA — struttura del database (Supabase / PostgreSQL)
--
--  Da incollare UNA VOLTA in Supabase: SQL Editor → New query → Run.
--  Prima di eseguire, sostituisci LA-TUA-EMAIL in fondo (sezione 4)
--  con l'email con cui accederai all'app.
--
--  Si può rieseguire senza danni: crea solo ciò che manca.
-- =====================================================================


-- 1. CHI PUÒ ENTRARE --------------------------------------------------
-- Non basta avere un account: l'email deve essere in questa lista.
-- La tabella non è leggibile dall'app (RLS attivo e nessuna regola di lettura).

create table if not exists public.autorizzati (
  email text primary key
);
alter table public.autorizzati enable row level security;

-- Funzione usata da tutte le regole qui sotto: "l'utente collegato è autorizzato?"
-- "security definer" = la funzione può leggere la lista anche se l'utente non può.
create or replace function public.e_autorizzato()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.autorizzati
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.e_autorizzato() from public, anon;
grant execute on function public.e_autorizzato() to authenticated;


-- 2. I DATI -----------------------------------------------------------
-- Una riga per ogni cosa salvata nell'app: un mezzo, un autista, una tratta,
-- una carta carburante, la descrizione di un file, il biglietto da visita, le impostazioni.
--   collezione = 'mezzi' | 'autisti' | 'tratte' | 'carte' | 'allegati' | 'contatti' | 'impostazioni'
--   dati       = l'oggetto così com'è nell'app (formato JSON)

create table if not exists public.record (
  collezione   text        not null,
  id           text        not null,
  dati         jsonb       not null,
  aggiornato   timestamptz not null default now(),
  aggiornato_da text       default (auth.jwt() ->> 'email'),
  primary key (collezione, id)
);
alter table public.record enable row level security;

-- L'app può leggere e scrivere la tabella solo dopo il login...
grant select, insert, update, delete on public.record to authenticated;

-- ...e solo se l'utente è nella lista degli autorizzati
drop policy if exists "solo utenti autorizzati" on public.record;
create policy "solo utenti autorizzati" on public.record
  for all
  to authenticated
  using (public.e_autorizzato())
  with check (public.e_autorizzato());


-- 3. I FILE (foto dei mezzi, libretti, patenti, modulistica) -------------
-- Archivio PRIVATO: nessun file è raggiungibile senza login.
-- Limite 20 MB per file, come nell'app.

insert into storage.buckets (id, name, public, file_size_limit)
values ('file', 'file', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "file: lettura autorizzati" on storage.objects;
create policy "file: lettura autorizzati" on storage.objects
  for select to authenticated
  using (bucket_id = 'file' and public.e_autorizzato());

drop policy if exists "file: caricamento autorizzati" on storage.objects;
create policy "file: caricamento autorizzati" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'file' and public.e_autorizzato());

drop policy if exists "file: modifica autorizzati" on storage.objects;
create policy "file: modifica autorizzati" on storage.objects
  for update to authenticated
  using (bucket_id = 'file' and public.e_autorizzato())
  with check (bucket_id = 'file' and public.e_autorizzato());

drop policy if exists "file: eliminazione autorizzati" on storage.objects;
create policy "file: eliminazione autorizzati" on storage.objects
  for delete to authenticated
  using (bucket_id = 'file' and public.e_autorizzato());


-- 4. TU ------------------------------------------------------------------
-- Sostituisci LA-TUA-EMAIL con la tua email (tra apici), poi premi Run.
-- Per aggiungere in futuro un collaboratore: stessa riga con la sua email.

insert into public.autorizzati (email) values ('LA-TUA-EMAIL')
on conflict (email) do nothing;
