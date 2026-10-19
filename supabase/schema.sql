-- =====================================================================
-- Repositorio Arqueología UCT: configuración completa de la base de datos
--
-- Para un proyecto de Supabase NUEVO. Pega todo este archivo en
-- Supabase > SQL Editor y ejecútalo una sola vez.
-- Si Supabase advierte de "consultas destructivas", es normal
-- (el script reemplaza algunas reglas); confirma para continuar.
-- NO lo ejecutes en un proyecto que ya está configurado: las tablas ya existen.
-- =====================================================================

-- =====================================================================
-- PARTE 1: Base: perfiles, publicaciones, comentarios, me gusta, reportes, seguridad y archivos
-- =====================================================================

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  aprobado boolean not null default false,   -- lo activa el Centro de Estudiantes
  es_admin boolean not null default false,
  creado timestamptz not null default now()
);

-- 2. Solo correos institucionales (se valida en el servidor, no se puede saltar)
create function public.solo_correo_uct() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email !~* '^[^@\s]+@(alu\.)?uct\.cl$' then
    raise exception 'Solo se permiten correos institucionales UCT';
  end if;
  return new;
end $$;
create trigger solo_correo_uct before insert on auth.users
  for each row execute function public.solo_correo_uct();

create function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, initcap(replace(replace(split_part(new.email, '@', 1), '.', ' '), '_', ' ')));
  return new;
end $$;
create trigger crear_perfil after insert on auth.users
  for each row execute function public.crear_perfil();

create function public.es_aprobado() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select aprobado from public.perfiles where id = auth.uid()), false)
$$;
create function public.es_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select es_admin from public.perfiles where id = auth.uid()), false)
$$;

-- 3. Filtro de contenido en el servidor (misma lista que src/moderation.js)
create function public.texto_permitido(t text) returns boolean
language plpgsql immutable as $$
declare
  n text := ' ' || regexp_replace(regexp_replace(
    lower(translate(t, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[^a-z0-9+ ]', ' ', 'g'), '\s+', ' ', 'g') || ' ';
  palabras text[] := array['xxx','nsfw','+18','18+','gore','snuff','erotico','erotica','sexo explicito',
    'pornografia infantil','venta de droga','vendo droga','armas ilegales','venta de piezas arqueologicas'];
  raices text[] := array['porno','pedofil','descuartiz','mutilacion'];
  w text;
begin
  foreach w in array palabras loop
    if position(' ' || w || ' ' in n) > 0 then return false; end if;
  end loop;
  foreach w in array raices loop
    if position(w in n) > 0 then return false; end if;
  end loop;
  return true;
end $$;

-- 4. Tablas
create type public.tipo_pub as enum ('tesis', 'libro', 'revista');

create table public.publicaciones (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  tipo public.tipo_pub not null,
  titulo text not null check (char_length(titulo) between 3 and 140),
  descripcion text not null check (char_length(descripcion) between 3 and 600),
  anio int not null check (anio between 1900 and 2100),
  archivo text not null,
  oculta boolean not null default false,
  creado timestamptz not null default now(),
  check (public.texto_permitido(titulo || ' ' || descripcion))
);
create table public.comentarios (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  autor_id uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  texto text not null check (char_length(texto) between 1 and 300 and public.texto_permitido(texto)),
  creado timestamptz not null default now()
);
create table public.likes (
  publicacion_id uuid references public.publicaciones(id) on delete cascade,
  usuario_id uuid default auth.uid() references public.perfiles(id) on delete cascade,
  primary key (publicacion_id, usuario_id)
);
create table public.reportes (
  id uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  creado timestamptz not null default now(),
  unique (publicacion_id, usuario_id)
);

-- 5. Con 3 reportes distintos, la publicación se oculta hasta que un admin la revise
create function public.auto_ocultar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.reportes where publicacion_id = new.publicacion_id) >= 3 then
    update public.publicaciones set oculta = true where id = new.publicacion_id;
  end if;
  return new;
end $$;
create trigger auto_ocultar after insert on public.reportes
  for each row execute function public.auto_ocultar();

-- 6. Seguridad por filas: solo cuentas aprobadas leen y escriben
alter table public.perfiles enable row level security;
alter table public.publicaciones enable row level security;
alter table public.comentarios enable row level security;
alter table public.likes enable row level security;
alter table public.reportes enable row level security;

create policy "ver perfiles" on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_aprobado());
create policy "editar mi nombre" on public.perfiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.perfiles from authenticated;
grant update (nombre) on public.perfiles to authenticated;

create policy "ver publicaciones" on public.publicaciones for select to authenticated
  using (public.es_aprobado() and (not oculta or autor_id = auth.uid() or public.es_admin()));
create policy "publicar" on public.publicaciones for insert to authenticated
  with check (public.es_aprobado() and autor_id = auth.uid());
create policy "borrar mis publicaciones" on public.publicaciones for delete to authenticated
  using (autor_id = auth.uid() or public.es_admin());

create policy "ver comentarios" on public.comentarios for select to authenticated using (public.es_aprobado());
create policy "comentar" on public.comentarios for insert to authenticated
  with check (public.es_aprobado() and autor_id = auth.uid());
create policy "borrar mis comentarios" on public.comentarios for delete to authenticated
  using (autor_id = auth.uid() or public.es_admin());

create policy "ver likes" on public.likes for select to authenticated using (public.es_aprobado());
create policy "dar like" on public.likes for insert to authenticated
  with check (public.es_aprobado() and usuario_id = auth.uid());
create policy "quitar like" on public.likes for delete to authenticated using (usuario_id = auth.uid());

create policy "reportar" on public.reportes for insert to authenticated
  with check (public.es_aprobado() and usuario_id = auth.uid());
create policy "ver reportes" on public.reportes for select to authenticated using (public.es_admin());

-- 7. Archivos: bucket privado, solo PDF/EPUB, máximo 25 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 26214400, array['application/pdf', 'application/epub+zip'])
on conflict (id) do nothing;

create policy "leer documentos" on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.es_aprobado());
create policy "subir documentos" on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.es_aprobado() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "borrar mis documentos" on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- PARTE 2: Perfil completo y fotos de perfil
-- =====================================================================

alter table public.perfiles
  add column apellido text not null default '',
  add column generacion int check (generacion between 1990 and 2100),
  add column foto_url text,
  add column configurado boolean not null default false;

-- Un perfil "configurado" necesita nombre, apellido y generación
alter table public.perfiles add constraint perfil_completo check (
  not configurado or (char_length(trim(nombre)) > 0 and char_length(trim(apellido)) > 0 and generacion is not null)
);
alter table public.perfiles add constraint perfil_texto_ok check (public.texto_permitido(nombre || ' ' || apellido));

-- Sin aprobación manual por ahora (el filtro por carrera llega después)
alter table public.perfiles alter column aprobado set default true;
update public.perfiles set aprobado = true;

-- Cada persona edita solo estos campos de su propio perfil
revoke update on public.perfiles from authenticated;
grant update (nombre, apellido, generacion, foto_url, configurado) on public.perfiles to authenticated;

-- Fotos de perfil: bucket público, solo imágenes, máximo 2 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "subir mi foto" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "borrar mi foto" on storage.objects for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- PARTE 3: Perfil ampliado, datos privados y límites de publicación
-- =====================================================================

alter table public.perfiles
  add column bio text check (char_length(bio) <= 300),
  add column ciudad text check (char_length(ciudad) <= 80),
  add column instagram text,
  add column linkedin text,
  add column sitio_web text;

alter table public.perfiles
  add constraint perfil_instagram_ok check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  add constraint perfil_linkedin_ok check (linkedin is null or linkedin ~* '^https://([a-z0-9-]+\.)?linkedin\.com/\S*$'),
  add constraint perfil_sitio_ok check (sitio_web is null or sitio_web ~* '^https://[a-z0-9.-]+\.[a-z]{2,}(/\S*)?$'),
  add constraint perfil_bio_ok check ((bio is null and ciudad is null) or public.texto_permitido(coalesce(bio, '') || ' ' || coalesce(ciudad, '')));

grant update (bio, ciudad, instagram, linkedin, sitio_web) on public.perfiles to authenticated;

-- 2. Datos privados: solo la propia persona puede verlos (nadie más, ni la comunidad)
create table public.perfiles_privados (
  id uuid primary key references public.perfiles(id) on delete cascade,
  fecha_nacimiento date check (fecha_nacimiento >= date '1930-01-01'),
  telefono text check (telefono ~ '^\+?[0-9 ()-]{8,20}$')
);
alter table public.perfiles_privados enable row level security;
create policy "mis datos privados" on public.perfiles_privados for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- 3. Límites de publicación: título 5 a 140, resumen 10 a 600 (no revisa las publicaciones antiguas)
alter table public.publicaciones
  drop constraint if exists publicaciones_titulo_check,
  drop constraint if exists publicaciones_descripcion_check;
alter table public.publicaciones
  add constraint publicaciones_titulo_check check (char_length(titulo) between 5 and 140) not valid,
  add constraint publicaciones_descripcion_check check (char_length(descripcion) between 10 and 600) not valid;

-- Para revisar si hay publicaciones guardadas que no se ven en la página:
-- select id, titulo, autor_id, oculta, creado from public.publicaciones order by creado desc;

-- =====================================================================
-- PARTE 4: Reparación automática de cuentas sin perfil
-- =====================================================================

insert into public.perfiles (id, nombre)
select u.id, initcap(replace(replace(split_part(u.email, '@', 1), '.', ' '), '_', ' '))
from auth.users u
where not exists (select 1 from public.perfiles p where p.id = u.id);

-- 2. La página llama a esta función si detecta una cuenta sin perfil
create or replace function public.asegurar_perfil() returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nombre)
  select u.id, initcap(replace(replace(split_part(u.email, '@', 1), '.', ' '), '_', ' '))
  from auth.users u where u.id = auth.uid()
  on conflict (id) do nothing;
end $$;
revoke execute on function public.asegurar_perfil() from public, anon;
grant execute on function public.asegurar_perfil() to authenticated;

-- =====================================================================
-- PARTE 5: Seguidores, miniaturas, administración, edición y eliminar cuenta
-- =====================================================================

create table public.seguidores (
  seguidor_id uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  seguido_id uuid not null references public.perfiles(id) on delete cascade,
  creado timestamptz not null default now(),
  primary key (seguidor_id, seguido_id),
  check (seguidor_id <> seguido_id)
);
alter table public.seguidores enable row level security;
create policy "ver seguidores" on public.seguidores for select to authenticated using (public.es_aprobado());
create policy "seguir" on public.seguidores for insert to authenticated
  with check (public.es_aprobado() and seguidor_id = auth.uid());
create policy "dejar de seguir" on public.seguidores for delete to authenticated using (seguidor_id = auth.uid());

-- 2. Publicaciones: miniatura y edición (la autora/el autor o un admin)
alter table public.publicaciones add column miniatura text;
revoke update on public.publicaciones from authenticated;
grant update (tipo, titulo, descripcion, anio) on public.publicaciones to authenticated;
create policy "editar publicaciones" on public.publicaciones for update to authenticated
  using (public.es_aprobado() and (autor_id = auth.uid() or public.es_admin()))
  with check (public.es_aprobado() and (autor_id = auth.uid() or public.es_admin()));

-- 3. Archivos: ahora el repositorio acepta imágenes, y hay un bucket privado de miniaturas
update storage.buckets
  set allowed_mime_types = array['application/pdf', 'application/epub+zip', 'image/jpeg', 'image/png', 'image/webp']
  where id = 'documentos';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('miniaturas', 'miniaturas', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "ver miniaturas" on storage.objects for select to authenticated
  using (bucket_id = 'miniaturas' and public.es_aprobado());
create policy "subir miniaturas" on storage.objects for insert to authenticated
  with check (bucket_id = 'miniaturas' and public.es_aprobado() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "borrar mis miniaturas" on storage.objects for delete to authenticated
  using (bucket_id = 'miniaturas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "listar mis fotos" on storage.objects for select to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
-- Un admin puede borrar los archivos de cualquier publicación o cuenta
create policy "admin borra archivos" on storage.objects for delete to authenticated
  using (bucket_id in ('documentos', 'miniaturas', 'avatares') and public.es_admin());

-- 4. Funciones de administración (solo funcionan si quien las llama es admin)
create function public.admin_set_admin(uid uuid, valor boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'Solo administradores'; end if;
  if uid = auth.uid() then raise exception 'No puedes cambiar tu propio rol'; end if;
  update public.perfiles set es_admin = valor where id = uid;
end $$;

create function public.admin_set_aprobado(uid uuid, valor boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'Solo administradores'; end if;
  if uid = auth.uid() then raise exception 'No puedes suspender tu propia cuenta'; end if;
  update public.perfiles set aprobado = valor where id = uid;
end $$;

create function public.admin_restaurar(pub uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'Solo administradores'; end if;
  update public.publicaciones set oculta = false where id = pub;
  delete from public.reportes where publicacion_id = pub;
end $$;

create function public.admin_eliminar_usuario(uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_admin() then raise exception 'Solo administradores'; end if;
  if uid = auth.uid() then raise exception 'Para eliminar tu cuenta usa la opción de tu perfil'; end if;
  delete from auth.users where id = uid;
end $$;

-- 5. Eliminar mi propia cuenta (borra perfil, publicaciones, comentarios, me gusta y seguidores)
create function public.eliminar_mi_cuenta() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'No hay sesión'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke execute on function public.admin_set_admin(uuid, boolean), public.admin_set_aprobado(uuid, boolean),
  public.admin_restaurar(uuid), public.admin_eliminar_usuario(uuid), public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.admin_set_admin(uuid, boolean), public.admin_set_aprobado(uuid, boolean),
  public.admin_restaurar(uuid), public.admin_eliminar_usuario(uuid), public.eliminar_mi_cuenta() to authenticated;

-- =====================================================================
-- PARTE 6: Lectura pública, identificador @ y tipo de cuenta
-- =====================================================================

alter table public.perfiles
  add column handle text,
  add column rol text not null default 'estudiante' check (rol in ('estudiante', 'academico'));

update public.perfiles p
set handle = lower(split_part(u.email, '@', 1)),
    rol = case when u.email ~* '@alu\.uct\.cl$' then 'estudiante' else 'academico' end
from auth.users u where u.id = p.id;

create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nombre, handle, rol)
  values (
    new.id,
    initcap(replace(replace(split_part(new.email, '@', 1), '.', ' '), '_', ' ')),
    lower(split_part(new.email, '@', 1)),
    case when new.email ~* '@alu\.uct\.cl$' then 'estudiante' else 'academico' end
  );
  return new;
end $$;

create or replace function public.asegurar_perfil() returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nombre, handle, rol)
  select u.id,
    initcap(replace(replace(split_part(u.email, '@', 1), '.', ' '), '_', ' ')),
    lower(split_part(u.email, '@', 1)),
    case when u.email ~* '@alu\.uct\.cl$' then 'estudiante' else 'academico' end
  from auth.users u where u.id = auth.uid()
  on conflict (id) do nothing;
end $$;

-- 2. Los académicos no tienen generación: solo los estudiantes deben indicarla
alter table public.perfiles drop constraint if exists perfil_completo;
alter table public.perfiles add constraint perfil_completo check (
  not configurado or (
    char_length(trim(nombre)) > 0 and char_length(trim(apellido)) > 0
    and (generacion is not null or rol = 'academico')
  )
);

-- 3. Lectura pública: cualquiera puede ver publicaciones y perfiles, pero no dar me gusta,
--    comentar ni publicar (eso sigue exigiendo cuenta). Abrir el documento completo también exige cuenta.
create policy "ver perfiles publico" on public.perfiles for select to anon using (configurado);
create policy "ver publicaciones publico" on public.publicaciones for select to anon using (not oculta);
create policy "ver comentarios publico" on public.comentarios for select to anon using (true);
create policy "ver likes publico" on public.likes for select to anon using (true);
create policy "ver seguidores publico" on public.seguidores for select to anon using (true);
create policy "ver miniaturas publico" on storage.objects for select to anon using (bucket_id = 'miniaturas');

-- =====================================================================
-- PARTE 7: Correo confirmado obligatorio
-- =====================================================================

create or replace function public.es_aprobado() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.aprobado and u.email_confirmed_at is not null
    from public.perfiles p join auth.users u on u.id = p.id
    where p.id = auth.uid()
  ), false)
$$;

-- Para revisar qué cuentas tienen el correo confirmado:
-- select email, email_confirmed_at from auth.users order by created_at desc;

-- =====================================================================
-- PARTE 8: Dominios de correo permitidos
-- =====================================================================

create or replace function public.correo_permitido(e text) returns boolean
language sql immutable as $$
  select e ~* '^[^@\s]+@(alu\.)?uct\.cl$'
$$;

-- Tipo de cuenta según el correo: @alu.uct.cl = estudiante, @uct.cl = académico
create or replace function public.rol_de(e text) returns text
language sql immutable as $$
  select case when e ~* '@alu\.uct\.cl$' then 'estudiante' else 'academico' end
$$;

create or replace function public.solo_correo_uct() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.correo_permitido(new.email) then
    raise exception 'Solo se permiten correos institucionales UCT';
  end if;
  return new;
end $$;

create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nombre, handle, rol)
  values (
    new.id,
    initcap(replace(replace(split_part(new.email, '@', 1), '.', ' '), '_', ' ')),
    lower(split_part(new.email, '@', 1)),
    public.rol_de(new.email)
  );
  return new;
end $$;

create or replace function public.asegurar_perfil() returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (id, nombre, handle, rol)
  select u.id,
    initcap(replace(replace(split_part(u.email, '@', 1), '.', ' '), '_', ' ')),
    lower(split_part(u.email, '@', 1)),
    public.rol_de(u.email)
  from auth.users u where u.id = auth.uid()
  on conflict (id) do nothing;
end $$;
