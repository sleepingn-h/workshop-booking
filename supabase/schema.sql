-- SQL Editor에서 전체 실행: 테이블·함수·시연 데이터를 재생성한다.
-- 시연 중 만든 데이터도 초기화되지만 Storage에 업로드한 파일은 유지한다.
begin;
set local search_path = public;

drop function if exists public.create_booking(uuid, integer, text, text, timestamptz);
drop function if exists public.customer_cancel_booking(text, text, timestamptz);
drop function if exists public.admin_set_booking_status(uuid, text, timestamptz);
drop function if exists public.admin_list_bookings(uuid, text, text);
drop function if exists public.create_session(uuid, timestamptz, integer, timestamptz);
drop function if exists public.update_session(uuid, timestamptz, integer, timestamptz);
drop function if exists public.delete_session(uuid);
drop function if exists public.cancel_session(uuid);
drop function if exists public.delete_class(uuid);
drop function if exists public.set_class_published(uuid, boolean);
drop function if exists public.set_class_published(uuid, boolean, timestamptz);
drop view if exists public.session_stats;
drop table if exists public.bookings cascade;
drop table if exists public.sessions cascade;
drop table if exists public.classes cascade;

insert into storage.buckets (id, name, public)
values ('class-images', 'class-images', true)
on conflict (id) do nothing;

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  description text not null default '',
  -- R-53: 안내 항목은 모두 필수다. 소요 시간은 분, 비용은 1인 원 단위다.
  place text not null check (btrim(place) <> ''),
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  price integer not null check (price between 0 and 10000000),
  payment_method text not null check (btrim(payment_method) <> ''),
  materials text not null check (btrim(materials) <> ''),
  contact text not null check (btrim(contact) <> ''),
  image_url text,
  image_path text,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete restrict,
  starts_at timestamptz not null,
  capacity integer not null check (capacity >= 1),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  session_id uuid not null references public.sessions(id) on delete restrict,
  headcount integer not null check (headcount between 1 and 4),
  customer_name text not null,
  phone text not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  created_at timestamptz not null default now()
);

create index bookings_session_id_idx on public.bookings (session_id);
create index sessions_class_id_idx on public.sessions (class_id);

-- R-01·R-03: 활성 예약만 점유하며, R-41: 모든 상태를 이력에 포함한다.
create view public.session_stats (session_id, occupied, booking_count)
with (security_invoker = true)
as
select
  s.id,
  coalesce(sum(b.headcount) filter (where b.status in ('pending', 'confirmed')), 0),
  count(b.id)
from public.sessions as s
left join public.bookings as b on b.session_id = s.id
group by s.id;

alter table public.classes enable row level security;
alter table public.sessions enable row level security;
alter table public.bookings enable row level security;

-- RLS 정책을 만들지 않는다. 접근은 서버의 service_role로 한정한다.
revoke all on table public.classes, public.sessions, public.bookings, public.session_stats
  from public, anon, authenticated;
grant select, insert, update, delete on table public.classes, public.sessions, public.bookings
  to service_role;
grant select on table public.session_stats to service_role;

-- 잠금은 클래스 → 회차 → 예약 순서다. 상위 객체를 찾는 첫 조회는 잠그지 않는다.
-- 시간 판정은 앱 서버가 넘긴 동일한 요청 시각 p_now만 사용한다.
create function create_booking(
  p_session_id uuid,
  p_headcount integer,
  p_customer_name text,
  p_phone text,
  p_now timestamptz
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_class_id uuid;
  v_is_published boolean;
  v_session public.sessions%rowtype;
  v_occupied bigint;
  v_customer_name text;
  v_phone text;
  v_code text;
  v_random_bytes bytea;
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_attempt integer;
  v_index integer;
begin
  select s.class_id into v_class_id
  from public.sessions as s
  where s.id = p_session_id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  select c.is_published into v_is_published
  from public.classes as c
  where c.id = v_class_id
  for share;
  if not found or not v_is_published then
    raise exception 'NOT_FOUND';
  end if;

  select s.* into v_session
  from public.sessions as s
  where s.id = p_session_id and s.class_id = v_class_id
  for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  end if;
  if p_now is null then
    raise exception 'VALIDATION_ERROR';
  end if;
  if p_now >= v_session.starts_at then
    raise exception 'SESSION_STARTED';
  end if;
  if p_headcount is null or p_headcount not between 1 and 4 then
    raise exception 'INVALID_HEADCOUNT';
  end if;

  v_customer_name := regexp_replace(p_customer_name, '^\s+|\s+$', '', 'g');
  v_phone := regexp_replace(p_phone, '[\s-]', '', 'g');
  if v_customer_name is null or v_customer_name = ''
    or v_phone is null or v_phone !~ '^[0-9]{10,11}$' then
    raise exception 'VALIDATION_ERROR';
  end if;

  -- R-16: 정규화한 전화번호와 활성 상태로 중복 여부를 다시 확인한다.
  if exists (
    select 1 from public.bookings as b
    where b.session_id = p_session_id and b.phone = v_phone
      and b.status in ('pending', 'confirmed')
  ) then
    raise exception 'DUPLICATE_BOOKING';
  end if;

  -- R-11·R-15: 회차 잠금을 유지한 채 최신 점유 인원을 집계하고 저장한다.
  select ss.occupied into v_occupied
  from public.session_stats as ss
  where ss.session_id = p_session_id;
  if p_headcount > v_session.capacity - v_occupied then
    raise exception 'SESSION_FULL';
  end if;

  for v_attempt in 1..10 loop
    -- UUID의 앞 6바이트는 난수다. 32자 알파벳으로 0/O/1/I를 제외한다.
    v_random_bytes := uuid_send(gen_random_uuid());
    v_code := 'BK-';
    for v_index in 0..5 loop
      v_code := v_code || substr(
        v_alphabet,
        (get_byte(v_random_bytes, v_index) % length(v_alphabet)) + 1,
        1
      );
    end loop;

    insert into public.bookings (code, session_id, headcount, customer_name, phone, status)
    values (v_code, p_session_id, p_headcount, v_customer_name, v_phone, 'pending')
    on conflict (code) do nothing;
    if found then
      return v_code;
    end if;
  end loop;

  -- 번호 충돌이 10회 계속되어도 기존 예약을 변경하지 않는다.
  raise exception 'INTERNAL_ERROR';
end;
$$;

create function customer_cancel_booking(
  p_code text,
  p_phone_last4 text,
  p_now timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session_id uuid;
  v_starts_at timestamptz;
  v_booking public.bookings%rowtype;
begin
  select b.session_id into v_session_id
  from public.bookings as b
  where b.code = p_code;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- 회차 취소·정원 변경과 같은 순서로 잠근 뒤 예약 상태를 다시 읽는다.
  select s.starts_at into v_starts_at
  from public.sessions as s
  where s.id = v_session_id
  for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  select b.* into v_booking
  from public.bookings as b
  where b.code = p_code and b.session_id = v_session_id
  for update;
  -- R-30: 인증을 확인하기 전에는 상태나 기한 오류를 반환하지 않는다.
  if not found or right(v_booking.phone, 4) is distinct from p_phone_last4 then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  if v_booking.status in ('rejected', 'cancelled') then
    raise exception 'INVALID_TRANSITION';
  end if;
  if p_now is null then
    raise exception 'VALIDATION_ERROR';
  end if;

  -- R-31: pending은 시작 직전까지, confirmed는 정확히 24시간 전을 포함한다.
  if not (
    (v_booking.status = 'pending' and p_now < v_starts_at)
    or (v_booking.status = 'confirmed' and p_now <= v_starts_at - interval '24 hours')
  ) then
    raise exception 'CANCEL_DEADLINE_PASSED';
  end if;

  update public.bookings as b
  set status = 'cancelled'
  where b.id = v_booking.id and b.status = v_booking.status;
  if not found then
    raise exception 'INVALID_TRANSITION';
  end if;
end;
$$;

create function admin_set_booking_status(
  p_booking_id uuid,
  p_action text,
  p_now timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session_id uuid;
  v_starts_at timestamptz;
  v_booking public.bookings%rowtype;
  v_next_status text;
begin
  select b.session_id into v_session_id
  from public.bookings as b
  where b.id = p_booking_id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  select s.starts_at into v_starts_at
  from public.sessions as s
  where s.id = v_session_id
  for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  select b.* into v_booking
  from public.bookings as b
  where b.id = p_booking_id and b.session_id = v_session_id
  for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  -- R-20·R-21·R-22·R-32: 최종 상태를 되돌리지 않으며 승인만 시작 시각을 검사한다.
  if p_action = 'confirm' then
    if v_booking.status <> 'pending' then
      raise exception 'INVALID_TRANSITION';
    end if;
    if p_now is null then
      raise exception 'VALIDATION_ERROR';
    end if;
    if p_now >= v_starts_at then
      raise exception 'SESSION_STARTED';
    end if;
    v_next_status := 'confirmed';
  elsif p_action = 'reject' then
    if v_booking.status <> 'pending' then
      raise exception 'INVALID_TRANSITION';
    end if;
    v_next_status := 'rejected';
  elsif p_action = 'cancel' then
    if v_booking.status not in ('pending', 'confirmed') then
      raise exception 'INVALID_TRANSITION';
    end if;
    v_next_status := 'cancelled';
  else
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.bookings as b
  set status = v_next_status
  where b.id = p_booking_id and b.status = v_booking.status;
  if not found then
    raise exception 'INVALID_TRANSITION';
  end if;
end;
$$;

create function admin_list_bookings(p_session_id uuid, p_status text, p_q text)
returns table (
  id uuid,
  code text,
  status text,
  headcount integer,
  customer_name text,
  phone text,
  class_title text,
  session_id uuid,
  session_starts_at timestamptz,
  session_status text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_q text := regexp_replace(p_q, '^\s+|\s+$', '', 'g');
  v_name_pattern text;
  v_phone text;
begin
  if p_status is not null
    and p_status not in ('pending', 'confirmed', 'rejected', 'cancelled') then
    raise exception 'VALIDATION_ERROR';
  end if;

  -- R-19: LIKE 특수 문자는 그대로 검색하고 전화번호는 정규화 후 완전 일치한다.
  v_name_pattern := '%' || replace(
    replace(replace(v_q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_'
  ) || '%';
  v_phone := regexp_replace(v_q, '[\s-]', '', 'g');

  return query
  select b.id, b.code, b.status, b.headcount, b.customer_name, b.phone,
    c.title, s.id, s.starts_at, s.status
  from public.bookings as b
  join public.sessions as s on s.id = b.session_id
  join public.classes as c on c.id = s.class_id
  where (p_session_id is null or b.session_id = p_session_id)
    and (p_status is null or b.status = p_status)
    and (
      v_q is null or v_q = ''
      or b.customer_name ilike v_name_pattern escape E'\\'
      or b.phone = v_phone
    )
  order by s.starts_at asc, b.created_at asc, b.id asc;
end;
$$;

create function create_session(
  p_class_id uuid,
  p_starts_at timestamptz,
  p_capacity integer,
  p_now timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform c.id from public.classes as c
  where c.id = p_class_id
  for share;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  -- R-46: 비공개 클래스에도 미래 회차를 준비할 수 있다.
  if p_now is null or p_starts_at is null or not isfinite(p_starts_at)
    or p_starts_at <= p_now or p_capacity is null or p_capacity < 1 then
    raise exception 'VALIDATION_ERROR';
  end if;

  insert into public.sessions (class_id, starts_at, capacity)
  values (p_class_id, p_starts_at, p_capacity)
  returning id into v_id;
  return v_id;
end;
$$;

create function update_session(
  p_session_id uuid,
  p_starts_at timestamptz,
  p_capacity integer,
  p_now timestamptz
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
  v_occupied bigint;
  v_booking_count bigint;
begin
  select s.* into v_session
  from public.sessions as s
  where s.id = p_session_id
  for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  end if;

  select ss.occupied, ss.booking_count into v_occupied, v_booking_count
  from public.session_stats as ss
  where ss.session_id = p_session_id;

  if p_capacity is not null then
    if p_capacity < 1 then
      raise exception 'VALIDATION_ERROR';
    end if;
    if p_capacity < v_occupied then
      raise exception 'CAPACITY_BELOW_OCCUPIED';
    end if;
  end if;
  if p_starts_at is not null and p_starts_at <> v_session.starts_at then
    -- R-44: 거절·취소까지 포함해 이력이 있으면 일정 변경을 막는다.
    if v_booking_count > 0 then
      raise exception 'SESSION_HAS_BOOKINGS';
    end if;
    if p_now is null or not isfinite(p_starts_at) or p_starts_at <= p_now then
      raise exception 'VALIDATION_ERROR';
    end if;
  end if;

  update public.sessions as s
  set starts_at = coalesce(p_starts_at, s.starts_at),
    capacity = coalesce(p_capacity, s.capacity)
  where s.id = p_session_id;
end;
$$;

create function delete_session(p_session_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform s.id from public.sessions as s
  where s.id = p_session_id
  for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if exists (select 1 from public.bookings as b where b.session_id = p_session_id) then
    raise exception 'SESSION_HAS_BOOKINGS';
  end if;

  delete from public.sessions as s where s.id = p_session_id;
end;
$$;

create function cancel_session(p_session_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
begin
  select s.status into v_status
  from public.sessions as s
  where s.id = p_session_id
  for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  end if;

  -- R-42·R-45: 회차를 먼저 잠그고 활성 예약만 같은 트랜잭션에서 취소한다.
  update public.sessions as s set status = 'cancelled' where s.id = p_session_id;
  update public.bookings as b
  set status = 'cancelled'
  where b.session_id = p_session_id and b.status in ('pending', 'confirmed');
end;
$$;

create function delete_class(p_class_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_image_path text;
begin
  select c.image_path into v_image_path
  from public.classes as c
  where c.id = p_class_id
  for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if exists (select 1 from public.sessions as s where s.class_id = p_class_id) then
    raise exception 'CLASS_HAS_SESSIONS';
  end if;

  delete from public.classes as c where c.id = p_class_id;
  -- Storage 파일 삭제는 호출한 서버가 처리한다. 샘플 이미지이면 null이다.
  return v_image_path;
end;
$$;

create function set_class_published(p_class_id uuid, p_is_published boolean, p_now timestamptz)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform c.id from public.classes as c
  where c.id = p_class_id
  for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if p_is_published is null or p_now is null then
    raise exception 'VALIDATION_ERROR';
  end if;
  -- R-59: 예정 회차(시작 전·미취소, 만석 포함)가 있어야 공개한다. 공개 후 회차가 없어지면 고객 조회에서 숨긴다.
  if p_is_published and not exists (
    select 1 from public.sessions as s
    where s.class_id = p_class_id and s.status = 'scheduled' and s.starts_at > p_now
  ) then
    raise exception 'NO_UPCOMING_SESSIONS';
  end if;

  update public.classes as c
  set is_published = p_is_published
  where c.id = p_class_id;
end;
$$;

-- RPC 권한은 트랜잭션 안에서 설정하여 공개 실행 가능한 중간 상태를 남기지 않는다.
revoke execute on function create_booking(uuid, integer, text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function customer_cancel_booking(text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function admin_set_booking_status(uuid, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function admin_list_bookings(uuid, text, text)
  from public, anon, authenticated;
revoke execute on function create_session(uuid, timestamptz, integer, timestamptz)
  from public, anon, authenticated;
revoke execute on function update_session(uuid, timestamptz, integer, timestamptz)
  from public, anon, authenticated;
revoke execute on function delete_session(uuid) from public, anon, authenticated;
revoke execute on function cancel_session(uuid) from public, anon, authenticated;
revoke execute on function delete_class(uuid) from public, anon, authenticated;
revoke execute on function set_class_published(uuid, boolean, timestamptz) from public, anon, authenticated;

grant execute on function create_booking(uuid, integer, text, text, timestamptz) to service_role;
grant execute on function customer_cancel_booking(text, text, timestamptz) to service_role;
grant execute on function admin_set_booking_status(uuid, text, timestamptz) to service_role;
grant execute on function admin_list_bookings(uuid, text, text) to service_role;
grant execute on function create_session(uuid, timestamptz, integer, timestamptz) to service_role;
grant execute on function update_session(uuid, timestamptz, integer, timestamptz) to service_role;
grant execute on function delete_session(uuid) to service_role;
grant execute on function cancel_session(uuid) to service_role;
grant execute on function delete_class(uuid) to service_role;
grant execute on function set_class_published(uuid, boolean, timestamptz) to service_role;

-- SAMPLE DATA
-- 모든 이름·주소·전화번호는 시연용 가상 값이며 이미지 파일은 별도로 준비한다.
-- 예약번호 | 전화번호 뒷자리 | 클래스·회차 | 상태 | 시연 용도
-- BK-DEMO01 | 0001 | A 도자기·4일 후 | pending | 핵심 시연(정원 6, 점유 2, 남은 자리 4)
-- BK-DEMO02 | 0002 | A 도자기·5일 후 | pending | 만석 회차의 승인 대기 2명
-- BK-DEMO03 | 0003 | A 도자기·5일 후 | confirmed | 만석 회차의 참여 확정 2명
-- BK-DEMO04 | 0004 | A 도자기·20시간 후 | confirmed | 24시간 이내 고객 직접 취소 제한
-- BK-DEMO05 | 0005 | A 도자기·2시간 전 | pending | 시작 후 참여 미확정·공방 문의
-- BK-DEMO06 | 0006 | A 도자기·6일 후(취소) | rejected | 취소된 회차의 거절 이력 조회
-- BK-DEMO07 | 0007 | A 도자기·6일 후(취소) | cancelled | 취소된 회차의 취소 이력 조회
-- BK-DEMO08 | 0008 | B 가죽·7일 후 | rejected | 거절 상태·자리 미점유
-- BK-DEMO09 | 0009 | B 가죽·7일 후 | cancelled | 취소 상태·자리 복구
-- BK-DEMO10 | 0010 | B 가죽·7일 후 | pending | 운영자 승인·거절·회차 취소
-- BK-DEMO11 | 0011 | D 비공개 캔들·6일 후 | pending | 비공개 클래스 기존 예약 조회·취소
-- C 꽃다발은 예정 회차가 없어 비공개로 둔다. 공개 전환 차단(R-59)과 클래스 삭제(R-50)를 시연한다.
-- E~N은 목록을 채우는 공개 클래스 10개다. 실행일(서울) 기준 9~32일 뒤 정각에 회차 2개씩 두고 예약은 두지 않는다.
-- 이미지는 일부만 A~D의 샘플 이미지를 다시 쓰고 나머지는 이미지 없이 둔다.

insert into public.classes (
  id, title, description, place, duration_minutes, price, payment_method, materials, contact, image_url, is_published
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '손으로 빚는 도자기 컵',
    '손으로 흙을 빚어 나만의 컵 하나를 완성해요. 완성품은 가마에 구운 뒤 3주 후에 찾아갈 수 있어요.',
    '가상 도자기 공방, 시연시 공방로 1 (가상 주소)', 120, 45000, '현장 결제', '없음', '010-0000-9001 (시연용 가상 번호)',
    '/samples/class-1.jpg',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '나만의 가죽 카드 지갑',
    '가죽을 재단하고 손바느질해 카드 지갑을 만들어요. 원하면 이니셜을 새길 수 있어요.',
    '가상 가죽 공방, 시연시 공방로 2 (가상 주소)', 150, 55000, '현장 결제', '없음', '010-0000-9002 (시연용 가상 번호)',
    '/samples/class-2.jpg',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '작은 꽃다발 만들기',
    '제철 꽃으로 작은 꽃다발을 만들어 바로 가져가요.',
    '가상 꽃 공방, 시연시 공방로 3 (가상 주소)', 90, 0, '결제 없음 (무료 클래스)', '꽃을 담아 갈 가방', '010-0000-9003 (시연용 가상 번호)',
    '/samples/class-3.jpg',
    false
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    '향을 고르는 캔들 클래스',
    '여러 향을 맡아 보고 골라 나만의 향초를 만들어요.',
    '가상 캔들 공방, 시연시 공방로 4 (가상 주소)', 120, 40000, '현장 결제', '없음', '010-0000-9004 (시연용 가상 번호)',
    '/samples/class-4.jpg',
    false
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    '제철 꽃 핸드타이드 부케',
    '제철 꽃을 골라 손으로 엮는 핸드타이드 부케를 만들어요. 포장까지 마치고 바로 가져가요.',
    '가상 플라워 스튜디오, 시연시 공방로 5 (가상 주소)', 120, 65000, '계좌 이체 (승인 후 안내)', '꽃을 담아 갈 쇼핑백', '010-0000-9005 (시연용 가상 번호)',
    '/samples/class-3.jpg',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000006',
    '두드려 만드는 은반지',
    '은판을 자르고 두드려 손가락 치수에 맞는 반지 하나를 완성해요. 표면 무늬는 직접 고를 수 있어요.',
    '가상 금속 공방, 시연시 공방로 6 (가상 주소)', 180, 75000, '현장 결제', '없음', '010-0000-9006 (시연용 가상 번호)',
    null,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000007',
    '소이 캔들과 왁스 태블릿',
    '소이 왁스에 향을 섞어 용기 캔들 하나와 드라이플라워 왁스 태블릿 두 개를 만들어요.',
    '가상 향기 공방, 시연시 공방로 7 (가상 주소)', 120, 48000, '현장 결제', '없음', '010-0000-9007 (시연용 가상 번호)',
    '/samples/class-4.jpg',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000008',
    '원목 치즈 도마',
    '원목을 톱질하고 사포로 다듬은 뒤 오일로 마감해 치즈 도마를 만들어요.',
    '가상 목공 공방, 시연시 공방로 8 (가상 주소)', 180, 70000, '계좌 이체 (승인 후 안내)', '편한 옷과 운동화', '010-0000-9008 (시연용 가상 번호)',
    null,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000009',
    '매듭으로 엮는 마크라메 월 행잉',
    '면 로프로 기본 매듭 세 가지를 배우고 벽에 거는 작은 월 행잉을 엮어요.',
    '가상 실 공방, 시연시 공방로 9 (가상 주소)', 120, 38000, '현장 결제', '없음', '010-0000-9009 (시연용 가상 번호)',
    null,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000010',
    '이름을 새기는 가죽 키링',
    '가죽에 이름이나 이니셜을 각인하고 손바느질해 키링 두 개를 만들어요.',
    '가상 가죽 작업실, 시연시 공방로 10 (가상 주소)', 90, 35000, '현장 결제', '없음', '010-0000-9010 (시연용 가상 번호)',
    '/samples/class-2.jpg',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000011',
    '천연 재료 비누 만들기',
    '식물성 오일과 천연 분말로 비누 네 개를 만들어요. 4주 숙성한 뒤 쓸 수 있어요.',
    '가상 비누 공방, 시연시 공방로 11 (가상 주소)', 90, 32000, '현장 결제', '비누를 담아 갈 가방', '010-0000-9011 (시연용 가상 번호)',
    null,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000012',
    '물레로 빚는 오목 접시',
    '물레 위에서 흙을 끌어올려 오목한 접시 한 점을 빚어요. 유약 색을 고르면 가마에 구워 4주 후에 찾아갈 수 있어요.',
    '가상 물레 공방, 시연시 공방로 12 (가상 주소)', 150, 60000, '현장 결제', '흙이 묻어도 괜찮은 옷', '010-0000-9012 (시연용 가상 번호)',
    '/samples/class-1.jpg',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000013',
    '프랑스 자수 꽃 브로치',
    '기본 스티치로 작은 꽃을 수놓고 브로치로 마감해요. 처음 수를 놓아도 괜찮아요.',
    '가상 자수 공방, 시연시 공방로 13 (가상 주소)', 120, 30000, '현장 결제', '없음', '010-0000-9013 (시연용 가상 번호)',
    null,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000014',
    '라탄 컵받침 엮기 체험',
    '라탄 줄기를 엮어 컵받침 하나를 만드는 짧은 체험 클래스예요.',
    '가상 라탄 공방, 시연시 공방로 14 (가상 주소)', 60, 0, '결제 없음 (무료 클래스)', '없음', '010-0000-9014 (시연용 가상 번호)',
    null,
    true
  );

insert into public.sessions (id, class_id, starts_at, capacity, status)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', now() + interval '4 days', 6, 'scheduled'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', now() + interval '5 days', 4, 'scheduled'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', now() + interval '20 hours', 4, 'scheduled'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', now() - interval '2 hours', 4, 'scheduled'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', now() + interval '6 days', 4, 'cancelled'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', now() + interval '7 days', 6, 'scheduled'),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000004', now() + interval '6 days', 4, 'scheduled');

-- E~N의 회차: 실행일(서울) 자정에 날짜·정각을 더한다. 첫 회차는 9~18일 뒤, 둘째 회차는 그 2주 뒤다.
insert into public.sessions (id, class_id, starts_at, capacity, status)
select
  v.id::uuid,
  v.class_id::uuid,
  (date_trunc('day', now() at time zone 'Asia/Seoul') + make_interval(days => v.days, hours => v.hours)) at time zone 'Asia/Seoul',
  v.capacity,
  'scheduled'
from (
  values
    ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000005', 9, 15, 6),
    ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000006', 10, 14, 4),
    ('20000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000007', 11, 19, 8),
    ('20000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000008', 12, 10, 6),
    ('20000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000009', 13, 15, 8),
    ('20000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000010', 14, 11, 8),
    ('20000000-0000-4000-8000-000000000014', '10000000-0000-4000-8000-000000000011', 15, 11, 10),
    ('20000000-0000-4000-8000-000000000015', '10000000-0000-4000-8000-000000000012', 16, 14, 6),
    ('20000000-0000-4000-8000-000000000016', '10000000-0000-4000-8000-000000000013', 17, 19, 6),
    ('20000000-0000-4000-8000-000000000017', '10000000-0000-4000-8000-000000000014', 18, 16, 10),
    ('20000000-0000-4000-8000-000000000018', '10000000-0000-4000-8000-000000000005', 23, 15, 6),
    ('20000000-0000-4000-8000-000000000019', '10000000-0000-4000-8000-000000000006', 24, 14, 4),
    ('20000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000007', 25, 19, 8),
    ('20000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000008', 26, 10, 6),
    ('20000000-0000-4000-8000-000000000022', '10000000-0000-4000-8000-000000000009', 27, 15, 8),
    ('20000000-0000-4000-8000-000000000023', '10000000-0000-4000-8000-000000000010', 28, 11, 8),
    ('20000000-0000-4000-8000-000000000024', '10000000-0000-4000-8000-000000000011', 29, 11, 10),
    ('20000000-0000-4000-8000-000000000025', '10000000-0000-4000-8000-000000000012', 30, 14, 6),
    ('20000000-0000-4000-8000-000000000026', '10000000-0000-4000-8000-000000000013', 31, 19, 6),
    ('20000000-0000-4000-8000-000000000027', '10000000-0000-4000-8000-000000000014', 32, 16, 10)
) as v (id, class_id, days, hours, capacity);

insert into public.bookings (id, code, session_id, headcount, customer_name, phone, status)
values
  ('30000000-0000-4000-8000-000000000001', 'BK-DEMO01', '20000000-0000-4000-8000-000000000001', 2, '가상예약자01', '01000000001', 'pending'),
  ('30000000-0000-4000-8000-000000000002', 'BK-DEMO02', '20000000-0000-4000-8000-000000000002', 2, '가상예약자02', '01000000002', 'pending'),
  ('30000000-0000-4000-8000-000000000003', 'BK-DEMO03', '20000000-0000-4000-8000-000000000002', 2, '가상예약자03', '01000000003', 'confirmed'),
  ('30000000-0000-4000-8000-000000000004', 'BK-DEMO04', '20000000-0000-4000-8000-000000000003', 1, '가상예약자04', '01000000004', 'confirmed'),
  ('30000000-0000-4000-8000-000000000005', 'BK-DEMO05', '20000000-0000-4000-8000-000000000004', 1, '가상예약자05', '01000000005', 'pending'),
  ('30000000-0000-4000-8000-000000000006', 'BK-DEMO06', '20000000-0000-4000-8000-000000000005', 1, '가상예약자06', '01000000006', 'rejected'),
  ('30000000-0000-4000-8000-000000000007', 'BK-DEMO07', '20000000-0000-4000-8000-000000000005', 2, '가상예약자07', '01000000007', 'cancelled'),
  ('30000000-0000-4000-8000-000000000008', 'BK-DEMO08', '20000000-0000-4000-8000-000000000006', 1, '가상예약자08', '01000000008', 'rejected'),
  ('30000000-0000-4000-8000-000000000009', 'BK-DEMO09', '20000000-0000-4000-8000-000000000006', 2, '가상예약자09', '01000000009', 'cancelled'),
  ('30000000-0000-4000-8000-000000000010', 'BK-DEMO10', '20000000-0000-4000-8000-000000000006', 1, '가상예약자10', '01000000010', 'pending'),
  ('30000000-0000-4000-8000-000000000011', 'BK-DEMO11', '20000000-0000-4000-8000-000000000007', 1, '가상예약자11', '01000000011', 'pending');

commit;
