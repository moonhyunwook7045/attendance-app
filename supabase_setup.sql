-- ============================================================
-- 출퇴근 관리 앱 - Supabase 통합 설정 스크립트 (GPS/캘린더 포함)
-- 사용법: Supabase 대시보드 → SQL Editor → 새 쿼리 → 아래 전체 붙여넣기 → Run
-- * 기존 DB에 다시 실행해도 안전(idempotent)합니다.
-- * 새 Supabase 프로젝트에 그대로 붙여넣어도 백엔드 전체가 세팅됩니다.
-- ============================================================

-- 1) profiles 테이블 (이름 / 권한)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  role text not null default 'employee' check (role in ('employee', 'admin')),
  created_at timestamptz not null default now()
);

-- 2) attendance 테이블 (출퇴근 기록 + 사진 + 위치)
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('check_in', 'check_out')),
  photo_url text,
  lat double precision,
  lng double precision,
  distance integer,
  created_at timestamptz not null default now()
);
-- (이미 attendance 테이블이 있던 경우를 대비해 위치 컬럼 보강)
alter table public.attendance add column if not exists lat double precision;
alter table public.attendance add column if not exists lng double precision;
alter table public.attendance add column if not exists distance integer;

-- 3) office_config 테이블 (GPS 위치체크인용 사업장 위치 설정)
create table if not exists public.office_config (
  id int primary key default 1,
  name text,
  lat double precision,
  lng double precision,
  radius integer default 100,
  updated_at timestamptz default now()
);

-- 4) 회원가입 시 profiles 자동 생성 트리거
--    Login 화면에서 회원가입 시 넘긴 이름(options.data.name)을 그대로 저장합니다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, new.raw_user_meta_data ->> 'name', 'employee');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5) 관리자 여부 확인 함수 (RLS 정책에서 재사용, 무한 재귀 방지용)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- 6) RLS 켜기
alter table public.profiles enable row level security;
alter table public.attendance enable row level security;
alter table public.office_config enable row level security;

-- 7) (선택) 구버전 정책 정리 — 중복 방지용. 없으면 그냥 넘어갑니다.
drop policy if exists "profiles viewable by authenticated" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
drop policy if exists "insert own attendance" on public.attendance;
drop policy if exists "select own or admin all" on public.attendance;
drop policy if exists "office readable by authenticated" on public.office_config;
drop policy if exists "office writable by admin" on public.office_config;
drop policy if exists "authenticated users can upload photos" on storage.objects;
drop policy if exists "public can view photos" on storage.objects;
drop policy if exists "authenticated upload photos" on storage.objects;
drop policy if exists "public view photos" on storage.objects;

-- 8) profiles 정책: 본인 것 또는 관리자는 전체 조회
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

-- 9) attendance 정책: 본인 기록만 등록, 본인 것 또는 관리자는 전체 조회
drop policy if exists "attendance_insert" on public.attendance;
create policy "attendance_insert" on public.attendance
  for insert with check (auth.uid() = user_id);

drop policy if exists "attendance_select" on public.attendance;
create policy "attendance_select" on public.attendance
  for select using (auth.uid() = user_id or public.is_admin());

-- 10) office_config 정책: 로그인 사용자는 조회, 관리자만 저장/수정
drop policy if exists "office_select" on public.office_config;
create policy "office_select" on public.office_config
  for select to authenticated using (true);

drop policy if exists "office_write" on public.office_config;
create policy "office_write" on public.office_config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 11) 출퇴근 사진용 스토리지 버킷 (공개 URL로 사용)
insert into storage.buckets (id, name, public)
values ('attendance-photos', 'attendance-photos', true)
on conflict (id) do nothing;

-- 12) 스토리지 정책: 본인 폴더(userId/)에만 업로드, 사진은 누구나 조회(공개 URL)
drop policy if exists "attendance_photos_insert" on storage.objects;
create policy "attendance_photos_insert" on storage.objects
  for insert with check (
    bucket_id = 'attendance-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "attendance_photos_select" on storage.objects;
create policy "attendance_photos_select" on storage.objects
  for select using (bucket_id = 'attendance-photos');

-- ============================================================
-- 실행 후 할 일
-- ============================================================
-- 1. 앱에서 관리자로 쓸 계정으로 먼저 회원가입 (일반 직원과 동일하게 가입됨)
-- 2. 아래 쿼리로 그 계정의 role을 admin으로 변경
--    (이메일은 본인이 가입한 이메일로 바꿔서 실행)
--
-- update public.profiles
-- set role = 'admin'
-- where id = (select id from auth.users where email = '관리자이메일@example.com');
-- ============================================================
