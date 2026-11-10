-- Beenget WhatsApp asistani tablolari
-- Supabase > SQL Editor > New query: bu dosyanin tamamini yapistirip "Run" deyin.

create table if not exists public.wa_conversations (
  wa_id          text primary key,              -- musterinin WhatsApp numarasi (905...)
  name           text,                          -- WhatsApp profil adi
  status         text not null default 'bot'    -- 'bot' veya 'human'
                 check (status in ('bot', 'human')),
  human_since    timestamptz,
  handoff_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.wa_messages (
  id             bigint generated always as identity primary key,
  wa_id          text not null,
  role           text not null check (role in ('user', 'assistant', 'owner_command')),
  content        text not null,
  wa_message_id  text unique,                   -- tekrar gelen webhook'lari engeller
  created_at     timestamptz not null default now()
);
create index if not exists wa_messages_wa_id_created_idx
  on public.wa_messages (wa_id, created_at desc);

create table if not exists public.wa_reservation_requests (
  id               bigint generated always as identity primary key,
  wa_id            text not null,
  whatsapp_name    text,
  customer_name    text not null,
  pickup_location  text not null,
  pickup_datetime  text not null,
  return_location  text,
  return_datetime  text not null,
  car_preference   text,
  driver_age       int,
  flight_number    text,
  extras           text,
  notes            text,
  language         text,
  status           text not null default 'yeni'   -- yeni / teyit_edildi / iptal
                   check (status in ('yeni', 'teyit_edildi', 'iptal')),
  created_at       timestamptz not null default now()
);
create index if not exists wa_reservation_requests_created_idx
  on public.wa_reservation_requests (created_at desc);

-- Guvenlik: tablolar disaridan (anon key ile) okunamaz/yazilamaz.
-- Asistan service_role anahtariyla calistigi icin RLS'den etkilenmez.
alter table public.wa_conversations        enable row level security;
alter table public.wa_messages             enable row level security;
alter table public.wa_reservation_requests enable row level security;
