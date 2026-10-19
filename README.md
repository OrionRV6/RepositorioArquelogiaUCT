# Repositorio Arqueología UCT

Plataforma web de tesis, libros y revistas científicas digitales de la carrera de Arqueología de la Universidad Católica de Temuco (UCT, Chile), con perfiles de usuario tipo red social.

Líder representativo del Centro de Estudiantes de Arqueología: Vicente Mujica Valladares.
Programación y diseño web: Benjamín Rodríguez Valladares (UCM).
© 2026 Todos los derechos reservados.

## Qué incluye

- Inicio con feed de publicaciones, buscador, filtros por tipo (tesis, libros, revistas) y vista previa del documento. Se puede ver sin cuenta.
- Cuentas con correo institucional (`@alu.uct.cl` estudiantes, `@uct.cl` académicos), clave y confirmación por correo.
- Perfil con foto, generación, descripción, ciudad, redes, seguidores y siguiendo, y distintivos de admin y de tipo de cuenta. Teléfono y fecha de nacimiento son privados.
- Publicar PDF, EPUB o imágenes (con miniatura opcional), me gusta con lista de quién reaccionó, comentarios, reportes, editar y eliminar publicaciones propias.
- Panel de administración: reportes por revisar, usuarios (admin, suspender, eliminar) y moderación de cualquier publicación o comentario.
- Filtro de contenido (obsceno, +18, gore, ilícito) aplicado en la página y en la base de datos.
- Eliminación permanente de la propia cuenta, con doble confirmación.

## Tecnología

React 18, Vite, Tailwind CSS 4, lucide-react y Supabase (autenticación, base de datos Postgres con seguridad por filas, y almacenamiento de archivos). `pdfjs-dist` genera la vista previa de los PDF en el navegador.

## Puesta en marcha

1. Instala las dependencias: `npm install`
2. Crea un proyecto en [supabase.com](https://supabase.com) y copia `.env.example` como `.env` con la URL y la anon key (Project Settings > API).
3. En Supabase > SQL Editor, pega y ejecuta una sola vez el archivo `supabase/schema.sql` (en un proyecto nuevo). Crea tablas, reglas de seguridad, carpetas de archivos y funciones.
4. Configura Supabase:
   - **Authentication > Providers > Email:** activa *Confirm email* y pon el mínimo de clave en 8.
   - **Authentication > URL Configuration:** agrega tu dirección como Site URL y `http://localhost:5173` como Redirect URL.
   - **Authentication > Emails > SMTP Settings:** configura un servidor de correo propio. Sin esto, Supabase solo envía correos a miembros de tu equipo.
5. Inicia: `npm run dev`

### Primer administrador

Crea una cuenta, completa el perfil y ejecuta en el SQL Editor:

```sql
update public.perfiles set es_admin = true
where id = (select id from auth.users where email = 'TU-CORREO@alu.uct.cl');
```

### Cuentas de prueba

Los correos que pueden crear cuenta se definen en la función `correo_permitido()` (parte 8 de `supabase/schema.sql`). Para probar sin correo UCT, crea el usuario a mano en Authentication > Users > Add user, con *Auto Confirm User*.

## Despliegue

Funciona en cualquier hosting estático (por ejemplo Vercel o Netlify): comando `npm run build`, carpeta `dist`, y las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Después agrega la dirección pública en *Redirect URLs* de Supabase.

## Estructura

```
src/App.jsx           pantallas y lógica de la aplicación
src/moderation.js     filtro de contenido
src/supabaseClient.js conexión a Supabase
public/               logo del Centro de Estudiantes y favicon
supabase/schema.sql   base de datos completa (tablas, seguridad y archivos)
```

## Pendientes

- Filtro para que solo estudiantes de Arqueología puedan publicar.
- Revisión automática de imágenes (hoy solo se revisa el texto; las imágenes dependen de los reportes).
- Servidor de correo propio con dominio (hoy puede usarse Gmail).
- Dividir `App.jsx` en componentes más pequeños.
