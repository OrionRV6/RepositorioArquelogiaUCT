import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'
import { Search, Heart, Flag, FileText, Upload, LogIn, LogOut, User, GraduationCap, BookOpen, Newspaper, MessageCircle, Share2, Send, Instagram, Linkedin, Globe, MapPin, Trash2, Pencil, X, Shield } from 'lucide-react'
import { isFlagged, validarArchivo, ARCHIVO_MAX_MB } from './moderation'

const TIPOS = {
  tesis: { label: 'Tesis', art: 'una tesis', Icon: GraduationCap },
  libro: { label: 'Libro', art: 'un libro', Icon: BookOpen },
  revista: { label: 'Revista', art: 'una revista', Icon: Newspaper },
}
const EMAIL_OK = /^[^\s@]+@(alu\.)?uct\.cl$/i
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const nombreCompleto = (p) => (p ? `${p.nombre} ${p.apellido}`.trim() : '') || 'Anónimo'

const rolDe = (email) => (/@alu\.uct\.cl$/i.test(email) ? 'estudiante' : 'academico')
const CIUDADES = [
  ['Arica y Parinacota', ['Arica']],
  ['Tarapacá', ['Iquique', 'Alto Hospicio']],
  ['Antofagasta', ['Antofagasta', 'Calama', 'Tocopilla']],
  ['Atacama', ['Copiapó', 'Caldera', 'Vallenar']],
  ['Coquimbo', ['La Serena', 'Coquimbo', 'Ovalle', 'Illapel']],
  ['Valparaíso', ['Valparaíso', 'Viña del Mar', 'Quilpué', 'Villa Alemana', 'Quillota', 'San Antonio', 'San Felipe', 'Los Andes', 'Isla de Pascua']],
  ['Metropolitana de Santiago', ['Santiago', 'Puente Alto', 'Maipú', 'La Florida', 'Las Condes', 'Ñuñoa', 'Providencia', 'San Bernardo', 'Melipilla', 'Talagante']],
  ["O'Higgins", ['Rancagua', 'San Fernando', 'Rengo', 'Santa Cruz']],
  ['Maule', ['Talca', 'Curicó', 'Linares', 'Constitución', 'Cauquenes']],
  ['Ñuble', ['Chillán', 'San Carlos', 'Bulnes']],
  ['Biobío', ['Concepción', 'Talcahuano', 'Los Ángeles', 'Coronel', 'Chiguayante', 'San Pedro de la Paz', 'Lebu']],
  ['La Araucanía', ['Temuco', 'Padre Las Casas', 'Villarrica', 'Pucón', 'Angol', 'Nueva Imperial', 'Lautaro', 'Victoria', 'Loncoche', 'Pitrufquén', 'Collipulli', 'Curacautín', 'Cunco']],
  ['Los Ríos', ['Valdivia', 'La Unión', 'Río Bueno', 'Panguipulli']],
  ['Los Lagos', ['Puerto Montt', 'Osorno', 'Puerto Varas', 'Castro', 'Ancud', 'Frutillar']],
  ['Aysén', ['Coyhaique', 'Puerto Aysén']],
  ['Magallanes', ['Punta Arenas', 'Puerto Natales']],
]
const esCiudad = (c) => c === 'Fuera de Chile' || CIUDADES.some(([, l]) => l.includes(c))
const GEN_MIN = 2019 // generación más antigua que se puede elegir; la lista llega hasta el año actual
const PUB_SEL = 'id,tipo,titulo,descripcion,anio,archivo,creado,autor_id,miniatura,oculta,perfiles!autor_id(nombre,apellido,generacion,foto_url)'
const aItem = (r, likes = 0) => ({
  id: r.id, t: r.tipo, title: r.titulo, desc: r.descripcion, year: r.anio, archivo: r.archivo,
  fecha: r.creado, owner: r.autor_id, miniatura: r.miniatura, oculta: r.oculta, author: nombreCompleto(r.perfiles), foto: r.perfiles?.foto_url, gen: r.perfiles?.generacion, likes,
})

// Traduce cualquier error del servidor a un mensaje claro para la persona.
function explicarError(e, que = 'completar la acción') {
  const m = `${e?.message || ''} ${e?.details || ''}`.toLowerCase()
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'No hay conexión a internet. Revisa tu conexión e inténtalo de nuevo.'
  if (/failed to fetch|networkerror|load failed/.test(m)) return 'No se pudo conectar con el servidor. Revisa tu internet e inténtalo de nuevo.'
  if (/publicaciones_check/.test(m)) return 'El título o el resumen contiene términos no permitidos (obsceno, +18, gore o ilícito).'
  if (/publicaciones_titulo/.test(m)) return 'El título debe tener entre 5 y 140 caracteres.'
  if (/publicaciones_descripcion/.test(m)) return 'El resumen debe tener entre 10 y 600 caracteres.'
  if (/publicaciones_anio/.test(m)) return 'El año de la publicación no es válido.'
  if (/perfil_texto_ok/.test(m)) return 'El nombre o el apellido contiene términos no permitidos.'
  if (/perfil_bio_ok|perfiles_bio|perfiles_ciudad/.test(m)) return 'La descripción o la ciudad no cumplen las reglas (máximo 300 y 80 caracteres, sin términos no permitidos).'
  if (/instagram/.test(m)) return 'El usuario de Instagram no es válido.'
  if (/linkedin/.test(m)) return 'El enlace de LinkedIn no es válido.'
  if (/perfil_sitio/.test(m)) return 'El sitio web no es válido. Debe empezar con https://.'
  if (/telefono/.test(m)) return 'El teléfono no es válido. Ejemplo: +56 9 1234 5678.'
  if (/fecha_nacimiento/.test(m)) return 'La fecha de nacimiento no es válida.'
  if (/jwt|expired|not authenticated/.test(m)) return 'Tu sesión expiró. Cierra sesión y vuelve a ingresar.'
  if (/payload too large|maximum allowed size|exceeded/.test(m)) return 'El archivo es demasiado pesado.'
  if (/mime type|not supported|invalid.*type/.test(m)) return 'Ese tipo de archivo no está permitido.'
  if (e?.code === '42501' || /row-level security|permission denied/.test(m)) return 'Tu cuenta no tiene permiso para hacer esto. Cierra sesión y vuelve a entrar; si sigue igual, avisa al equipo.'
  if (e?.code === '23505') return 'Eso ya existe.'
  if (e?.code === '23514') return 'Algún dato no cumple las reglas. Revisa los campos.'
  return `No se pudo ${que}. Inténtalo de nuevo; si sigue fallando, avisa al equipo (detalle: ${e?.code || e?.message || 'sin código'}).`
}

export default function App() {
  const [sesion, setSesion] = useState(undefined) // undefined = cargando
  const [perfil, setPerfil] = useState(null)
  const [items, setItems] = useState([])
  const [liked, setLiked] = useState({})
  const [comentarios, setComentarios] = useState({})
  const [vista, setVista] = useState({ v: 'home' })
  const [aviso, setAviso] = useState('')
  const [priv, setPriv] = useState({})
  const [personas, setPersonas] = useState({})
  const [errorCarga, setErrorCarga] = useState('')
  const cargaId = useRef(0)
  const [seg, setSeg] = useState([])
  const [likesPor, setLikesPor] = useState({})
  const [modal, setModal] = useState(null)
  const [nReportes, setNReportes] = useState(0)

  const user = sesion && perfil
    ? { id: sesion.user.id, email: sesion.user.email, ...perfil, name: nombreCompleto(perfil), foto: perfil.foto_url, ...priv }
    : null

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion((prev) => (prev?.user?.id === s?.user?.id ? prev : s)))
    return () => data.subscription.unsubscribe()
  }, [])

  const cargar = useCallback(async () => {
    const mi = ++cargaId.current // si llega una carga más nueva, la antigua se descarta
    const uid = sesion?.user.id ?? null
    let esAdmin = false
    if (sesion) {
    const leerPerfil = () => supabase.from('perfiles')
      .select('nombre,apellido,generacion,foto_url,configurado,bio,ciudad,instagram,linkedin,sitio_web,es_admin,aprobado,handle,rol').eq('id', sesion.user.id).maybeSingle()
    let { data: p, error: ep } = await leerPerfil()
    if (!p && !ep) { // la cuenta existe pero no tiene perfil: se crea automáticamente
      const r = await supabase.rpc('asegurar_perfil')
      if (r.error) ep = r.error
      else ({ data: p, error: ep } = await leerPerfil())
    }
    if (mi !== cargaId.current) return
    if (ep || !p) { console.error(ep); setErrorCarga(explicarError(ep ?? { message: 'perfil no encontrado' }, 'cargar tu perfil')); return }
    setErrorCarga('')
    setPerfil(p)
    if (!p.configurado) { setItems([]); return }
      esAdmin = !!p.es_admin
    } else { setPerfil(null); setPriv({}); setErrorCarga('') }
    const [pubs, lk, cm, ps, pv, sg, rp] = await Promise.all([
      supabase.from('publicaciones').select(PUB_SEL).order('creado', { ascending: false }),
      supabase.from('likes').select('publicacion_id,usuario_id'),
      supabase.from('comentarios').select('id,publicacion_id,autor_id,texto,creado,perfiles!autor_id(nombre,apellido)').order('creado'),
      supabase.from('perfiles').select('id,nombre,apellido,generacion,foto_url,bio,ciudad,instagram,linkedin,sitio_web,handle,rol,es_admin'),
      uid ? supabase.from('perfiles_privados').select('fecha_nacimiento,telefono').eq('id', uid).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from('seguidores').select('seguidor_id,seguido_id'),
      esAdmin ? supabase.from('reportes').select('publicacion_id') : Promise.resolve({ data: [], error: null }),
    ])
    if (mi !== cargaId.current) return
    const fallo = pubs.error || lk.error || cm.error || ps.error || pv.error || sg.error || rp.error
    if (fallo) { console.error(fallo); setErrorCarga(explicarError(fallo, 'cargar las publicaciones')); return }
    setErrorCarga('')
    const cont = {}, mios = {}, com = {}, mapa = {}, por = {}
    for (const l of lk.data || []) {
      cont[l.publicacion_id] = (cont[l.publicacion_id] || 0) + 1
      ;(por[l.publicacion_id] ||= []).push(l.usuario_id)
      if (l.usuario_id === uid) mios[l.publicacion_id] = true
    }
    for (const c of cm.data || []) (com[c.publicacion_id] ||= []).push({ id: c.id, autorId: c.autor_id, autor: nombreCompleto(c.perfiles), texto: c.texto, fecha: c.creado })
    for (const x of ps.data || []) mapa[x.id] = x
    const lista = (pubs.data || []).map((r) => aItem(r, cont[r.id] || 0))
    const rutas = lista.filter((i) => i.miniatura).map((i) => i.miniatura)
    if (rutas.length) { // vistas previas: enlaces temporales de una hora
      try {
        const { data: urls } = await supabase.storage.from('miniaturas').createSignedUrls(rutas, 3600)
        const mapaUrl = {}
        for (const u of urls || []) if (u.signedUrl) mapaUrl[u.path] = u.signedUrl
        for (const i of lista) i.prev = mapaUrl[i.miniatura]
      } catch (x) { console.warn('No se pudieron cargar las vistas previas', x) }
      if (mi !== cargaId.current) return
    }
    setPersonas(mapa); setPriv(pv.data || {}); setLiked(mios); setComentarios(com)
    setSeg(sg.data || []); setLikesPor(por); setItems(lista)
    setNReportes(new Set((rp.data || []).map((r) => r.publicacion_id)).size)
  }, [sesion])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { if (sesion) setVista((v) => (v.v === 'login' ? { v: 'home' } : v)) }, [sesion])

  const avisar = (m) => { setAviso(m); setTimeout(() => setAviso(''), 2600) }
  const ir = (v, a) => {
    if (v === 'subir' && !user) { avisar('Ingresa con tu correo institucional'); v = 'login' }
    setVista({ v, a }); window.scrollTo(0, 0)
  }
  const salir = async () => { await supabase.auth.signOut(); avisar('Sesión cerrada'); ir('home') }

  const verPersonas = (titulo, ids) => setModal({ k: 'personas', titulo, ids })
  const onBorrar = (item) => setModal({ k: 'borrar', item })
  const onEditar = (item) => setModal({ k: 'editar', item })

  const toggleSeguir = async (id) => {
    if (!user) return ir('login')
    if (id === user.id) return
    const ya = seg.some((s) => s.seguidor_id === user.id && s.seguido_id === id)
    setSeg((l) => (ya ? l.filter((s) => !(s.seguidor_id === user.id && s.seguido_id === id)) : [...l, { seguidor_id: user.id, seguido_id: id }]))
    const { error } = ya
      ? await supabase.from('seguidores').delete().match({ seguidor_id: user.id, seguido_id: id })
      : await supabase.from('seguidores').insert({ seguido_id: id })
    if (error) { console.error(error); avisar(explicarError(error, 'actualizar el seguimiento')); cargar() }
  }

  const onBorrarComentario = async (pid, cid) => {
    const { data, error } = await supabase.from('comentarios').delete().eq('id', cid).select('id')
    if (error || !data?.length) { console.error(error); return avisar(error ? explicarError(error, 'eliminar el comentario') : 'No tienes permiso para eliminar este comentario.') }
    setComentarios((c) => ({ ...c, [pid]: (c[pid] || []).filter((x) => x.id !== cid) }))
  }

  const acciones = {
    user, liked, ir, comentarios, personas, seg, likesPor, toggleSeguir, verPersonas, onBorrar, onEditar, onBorrarComentario,
    onLike: async (id) => {
      if (!user) return ir('login')
      const ya = !!liked[id]
      setLiked((l) => ({ ...l, [id]: !ya }))
      setItems((l) => l.map((i) => (i.id === id ? { ...i, likes: i.likes + (ya ? -1 : 1) } : i)))
      const { error } = ya
        ? await supabase.from('likes').delete().match({ publicacion_id: id, usuario_id: user.id })
        : await supabase.from('likes').insert({ publicacion_id: id })
      if (error) { console.error(error); avisar(explicarError(error, 'guardar tu me gusta')); cargar() }
    },
    onOpen: async (i) => {
      if (!user) { avisar('Inicia sesión para abrir el documento'); return ir('login') }
      const { data, error } = await supabase.storage.from('documentos').createSignedUrl(i.archivo, 300)
      if (error) { console.error(error); return avisar(explicarError(error, 'abrir el documento')) }
      window.open(data.signedUrl, '_blank')
    },
    onReport: async (id) => {
      if (!user) return ir('login')
      const { error } = await supabase.from('reportes').insert({ publicacion_id: id })
      avisar(error ? (error.code === '23505' ? 'Ya reportaste esta publicación.' : explicarError(error, 'enviar el reporte')) : 'Reporte enviado al equipo de moderación')
      if (!error) cargar()
    },
    onShare: () => { try { navigator.clipboard.writeText(window.location.href) } catch { /* sin portapapeles */ } avisar('Enlace copiado') },
    onComentar: async (id, texto) => {
      if (!user) { ir('login'); return false }
      const t = texto.trim()
      if (!t) return false
      if (isFlagged(t)) { avisar('Comentario bloqueado: contiene términos no permitidos'); return false }
      const { data, error } = await supabase.from('comentarios').insert({ publicacion_id: id, texto: t }).select('id').single()
      if (error) { console.error(error); avisar(explicarError(error, 'publicar el comentario')); return false }
      setComentarios((c) => ({ ...c, [id]: [...(c[id] || []), { id: data.id, autorId: user.id, autor: user.name, texto: t, fecha: new Date().toISOString() }] }))
      return true
    },
  }

  const guardarPerfil = async (d) => {
    let foto_url = user.foto ?? null
    if (d.foto) {
      const ext = (d.foto.name.split('.').pop() || 'jpg').toLowerCase()
      const ruta = `${user.id}/${Date.now()}.${ext}`
      const sube = await supabase.storage.from('avatares').upload(ruta, d.foto, { contentType: d.foto.type })
      if (sube.error) { console.error(sube.error); return explicarError(sube.error, 'subir la foto (usa JPG, PNG o WEBP de hasta 2 MB)') }
      foto_url = supabase.storage.from('avatares').getPublicUrl(ruta).data.publicUrl
    }
    const pv = await supabase.from('perfiles_privados').upsert({ id: user.id, fecha_nacimiento: d.fecha_nacimiento, telefono: d.telefono })
    if (pv.error) { console.error(pv.error); return explicarError(pv.error, 'guardar tus datos privados') }
    const { error } = await supabase.from('perfiles').update({
      nombre: d.nombre, apellido: d.apellido, generacion: d.generacion, foto_url, bio: d.bio, ciudad: d.ciudad,
      instagram: d.instagram, linkedin: d.linkedin, sitio_web: d.sitio_web, configurado: true,
    }).eq('id', user.id)
    if (error) { console.error(error); return explicarError(error, 'guardar tu perfil') }
    const primera = !user.configurado
    await cargar(); avisar('Perfil guardado'); ir(primera ? 'home' : 'perfil', user.id)
    return ''
  }

  const publicar = async (item, file, miniatura) => {
    const base = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ext = extDe(file)
    const ruta = `${base}.${ext}`
    const sube = await supabase.storage.from('documentos').upload(ruta, file, { contentType: MIME[ext] })
    if (sube.error) { console.error(sube.error); return explicarError(sube.error, 'subir el archivo') }
    let rutaPrev = null
    const previa = await crearPrevia(file, miniatura) // miniatura propia, imagen o primera página del PDF
    if (previa) {
      const r = await supabase.storage.from('miniaturas').upload(`${base}.jpg`, previa, { contentType: 'image/jpeg' })
      if (r.error) console.error(r.error)
      else rutaPrev = `${base}.jpg`
    }
    const { data, error } = await supabase.from('publicaciones')
      .insert({ tipo: item.t, titulo: item.title, descripcion: item.desc, anio: item.year, archivo: ruta, miniatura: rutaPrev })
      .select(PUB_SEL).single()
    if (error) {
      console.error(error)
      await supabase.storage.from('documentos').remove([ruta])
      if (rutaPrev) await supabase.storage.from('miniaturas').remove([rutaPrev])
      return explicarError(error, 'publicar')
    }
    setItems((l) => [aItem(data), ...l.filter((x) => x.id !== data.id)]) // aparece al instante
    avisar('Publicación subida correctamente')
    ir('home'); cargar() // cargar() agrega la vista previa
    return ''
  }

  const editarPublicacion = async (item, d) => {
    const { data, error } = await supabase.from('publicaciones')
      .update({ tipo: d.t, titulo: d.title, descripcion: d.desc, anio: d.year }).eq('id', item.id).select(PUB_SEL).single()
    if (error) { console.error(error); return error.code === 'PGRST116' ? 'No tienes permiso para editar esta publicación.' : explicarError(error, 'guardar los cambios') }
    setItems((l) => l.map((x) => (x.id === item.id ? { ...x, ...aItem(data, x.likes), prev: x.prev } : x)))
    setModal(null); avisar('Cambios guardados')
    return ''
  }

  const borrarPublicacion = async (item) => {
    const { data, error } = await supabase.from('publicaciones').delete().eq('id', item.id).select('id')
    if (error) { console.error(error); return explicarError(error, 'eliminar la publicación') }
    if (!data?.length) return 'No tienes permiso para eliminar esta publicación.'
    await supabase.storage.from('documentos').remove([item.archivo])
    if (item.miniatura) await supabase.storage.from('miniaturas').remove([item.miniatura])
    setItems((l) => l.filter((x) => x.id !== item.id))
    setModal(null); avisar('Publicación eliminada')
    return ''
  }

  const eliminarCuenta = async () => {
    for (const b of ['documentos', 'miniaturas', 'avatares']) {
      try {
        const { data } = await supabase.storage.from(b).list(user.id, { limit: 1000 })
        const rutas = (data || []).map((f) => `${user.id}/${f.name}`)
        if (rutas.length) await supabase.storage.from(b).remove(rutas)
      } catch (x) { console.warn('No se pudieron borrar algunos archivos', x) }
    }
    const { error } = await supabase.rpc('eliminar_mi_cuenta')
    if (error) { console.error(error); return explicarError(error, 'eliminar tu perfil') }
    await supabase.auth.signOut()
    avisar('Tu perfil fue eliminado. Hasta pronto.'); ir('home')
    return ''
  }

  let contenido
  if (sesion === undefined) contenido = <p className="p-10 text-center text-tenue">Cargando…</p>
  else if (sesion && !perfil) contenido = <p className="p-10 text-center text-tenue">Cargando…</p>
  else if (user && user.aprobado === false) contenido = <div className="mx-auto my-10 max-w-md rounded-2xl border border-borde bg-fondo p-7 text-center"><h2 className="font-serif text-2xl font-bold">Cuenta suspendida</h2><p className="mt-3 text-tenue">Tu cuenta está suspendida por el equipo de administración. Si crees que es un error, contacta al Centro de Estudiantes de Arqueología.</p></div>
  else if (user && !user.configurado) contenido = <ConfigPerfil user={user} primera onGuardar={guardarPerfil} />
  else if (vista.v === 'config' && user) contenido = <ConfigPerfil user={user} onGuardar={guardarPerfil} onEliminar={eliminarCuenta} />
  else if (vista.v === 'admin' && user?.es_admin) contenido = <AdminPanel todos={items} user={user} avisar={avisar} cargar={cargar} onOpen={acciones.onOpen} onBorrar={onBorrar} ir={ir} />
  else if (vista.v === 'login') contenido = <Login />
  else if (vista.v === 'subir' && user) contenido = <Subir onPublicar={publicar} />
  else if (vista.v === 'perfil') contenido = <Perfil email={vista.a} todos={items} {...acciones} />
  else contenido = <Inicio todos={items} {...acciones} />

  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} ir={ir} salir={salir} personas={personas} pendientes={nReportes} />
      <main className="flex-1 bg-suave">
        {errorCarga && (
          <div role="alert" className="mx-auto mt-4 flex max-w-5xl flex-wrap items-center justify-between gap-3 rounded-lg border border-red-400 bg-red-500/10 px-4 py-3 text-sm text-red-600">
            <span>{errorCarga}</span>
            <span className="flex gap-2"><button onClick={cargar} className="rounded-full border border-red-400 px-3 py-1">Reintentar</button>{sesion && <button onClick={salir} className="rounded-full border border-red-400 px-3 py-1">Cerrar sesión</button>}</span>
          </div>
        )}
        {contenido}
      </main>
      <Footer />
      {modal?.k === 'personas' && <ListaPersonas titulo={modal.titulo} ids={modal.ids} onClose={() => setModal(null)} {...acciones} />}
      {modal?.k === 'borrar' && <ConfirmarBorrado item={modal.item} onConfirm={borrarPublicacion} onClose={() => setModal(null)} />}
      {modal?.k === 'editar' && <EditarPub item={modal.item} onGuardar={editarPublicacion} onClose={() => setModal(null)} />}
      <div role="status" className={`fixed bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-texto px-5 py-2 text-sm text-fondo transition-opacity ${aviso ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>{aviso}</div>
    </div>
  )
}

function Header({ user, ir, salir, personas, pendientes }) {
  const btn = 'inline-flex items-center gap-1.5 rounded-full border border-borde px-4 py-1.5 text-sm hover:border-tierra'
  return (
    <header className="sticky top-0 z-10 border-b border-borde bg-fondo">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3">
        <button onClick={() => ir('home')} className="flex items-center gap-2.5 font-serif text-lg font-bold">
          <LogoCEA s={40} />
          Repositorio Arqueología UCT
        </button>
        <div className="order-last w-full sm:order-none sm:w-64"><BuscadorPerfiles personas={personas} ir={ir} /></div>
        <nav className="flex flex-wrap gap-1.5">
          <button className={btn} onClick={() => ir('home')}>Inicio</button>
          {user ? (
            <>
              <button className={btn} onClick={() => ir('subir')}><Upload size={15} />Subir</button>
              {user.es_admin && <button className={btn} onClick={() => ir('admin')}><Shield size={15} />Admin{pendientes > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white" title="Publicaciones reportadas por revisar">{pendientes}</span>}</button>}
              <button className={btn} onClick={() => ir('perfil', user.id)}><User size={15} />Mi perfil</button>
              <button className={btn} onClick={salir}><LogOut size={15} />Salir</button>
            </>
          ) : (
            <button className={btn + ' !border-tierra bg-tierra text-white'} onClick={() => ir('login')}><LogIn size={15} />Ingresar</button>
          )}
        </nav>
      </div>
      <Estratos e={0.3} />
    </header>
  )
}

function LogoCEA({ s = 32 }) {
  const [ok, setOk] = useState(true)
  if (!ok) return <span style={{ width: s, height: s }} className="shrink-0 rounded-full border-[3px] border-texto bg-tierra" />
  return <img src="/logo-cea.png" alt="Logo del Centro de Estudiantes de Arqueología" onError={() => setOk(false)} style={{ width: s, height: s }} className="shrink-0 object-contain" />
}

function BuscadorPerfiles({ personas = {}, ir }) {
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  const t = norm(q.replace(/^@/, '').trim())
  const res = t ? Object.entries(personas).filter(([, p]) => norm(`${p.nombre} ${p.apellido} ${p.handle || ''}`).includes(t)).slice(0, 6) : []
  return (
    <div className="relative">
      <label className="relative block">
        <span className="sr-only">Buscar personas</span>
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tenue" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setAbierto(true) }} onFocus={() => setAbierto(true)} onBlur={() => setTimeout(() => setAbierto(false), 150)} placeholder="Buscar personas" className="w-full rounded-full border border-borde bg-fondo py-1.5 pl-9 pr-3 text-sm" />
      </label>
      {abierto && q.trim() && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-borde bg-fondo shadow-lg">
          {res.length === 0 ? <p className="p-3 text-sm text-tenue">No encontramos a nadie con ese nombre.</p> : res.map(([id, p]) => (
            <button key={id} onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(''); setAbierto(false); ir('perfil', id) }} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-suave">
              <Avatar n={nombreCompleto(p)} s={34} foto={p.foto_url} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{nombreCompleto(p)}</span>
                <span className="block truncate text-xs text-tenue">{p.handle ? `@${p.handle}` : ''}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Capas de color como un corte estratigráfico: el elemento memorable del sitio.
const ESTRATOS = [['#c9935f', 6], ['#7b4f2e', 16], ['#a3764f', 5], ['#4a2f1b', 10], ['#7b4f2e', 4], ['#2b1b10', 14]]
function Estratos({ e = 1 }) {
  return <div aria-hidden>{ESTRATOS.map(([c, h], i) => <div key={i} style={{ background: c, height: Math.max(1, Math.round(h * e)) }} />)}</div>
}

const caja = 'rounded-xl border border-borde bg-fondo'

function Avatar({ n, s = 40, foto }) {
  if (foto) return <img src={foto} alt="" style={{ width: s, height: s }} className="shrink-0 rounded-full object-cover" />
  return <span style={{ width: s, height: s, fontSize: s * 0.42 }} className="grid shrink-0 place-items-center rounded-full bg-tierra font-serif font-bold text-white">{n[0]}</span>
}

const hace = (f) => {
  if (!f) return 'hace poco'
  const m = (Date.now() - new Date(f)) / 6e4
  if (m < 60) return `hace ${Math.max(1, Math.floor(m))} min`
  if (m < 1440) return `hace ${Math.floor(m / 60)} h`
  return `hace ${Math.floor(m / 1440)} d`
}

function TarjetaPerfil({ user, ir, n }) {
  return (
    <div className={caja + ' overflow-hidden'}>
      <div className="bg-noche pt-8"><Estratos e={0.6} /></div>
      <div className="-mt-7 px-4 pb-4">
        {user ? (
          <>
            <span className="inline-block rounded-full ring-4 ring-fondo"><Avatar n={user.name} s={56} foto={user.foto} /></span>
            <button onClick={() => ir('perfil', user.id)} className="mt-2 block font-serif text-lg font-semibold hover:text-tierra">{user.name}</button>
            <p className="break-all text-xs text-tenue">{user.email}</p>
            <p className="mt-2 text-sm">{n} publicación(es)</p>
          </>
        ) : (
          <>
            <span className="inline-grid h-14 w-14 place-items-center rounded-full bg-suave text-tenue ring-4 ring-fondo"><User size={24} /></span>
            <p className="mt-2 text-sm text-tenue">Ingresa con tu correo institucional para publicar y comentar.</p>
            <button onClick={() => ir('login')} className="mt-3 w-full rounded-full bg-tierra py-2 text-sm font-medium text-white">Ingresar</button>
          </>
        )}
      </div>
    </div>
  )
}

function Inicio({ todos, ...acc }) {
  const { user, ir } = acc
  const [filtro, setFiltro] = useState('todos')
  const [q, setQ] = useState('')
  const lista = todos
    .filter((i) => (filtro === 'todos' || i.t === filtro) && norm(`${i.title} ${i.author} ${i.desc}`).includes(norm(q)))
    .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0))
  const autores = Object.entries(acc.personas || {}).filter(([id]) => id !== user?.id).map(([id, p]) => [id, p, todos.filter((i) => i.owner === id).length]).sort((a, b) => b[2] - a[2]).slice(0, 5)
  const filtros = [['todos', 'Todo', FileText], ['tesis', 'Tesis', GraduationCap], ['libro', 'Libros', BookOpen], ['revista', 'Revistas', Newspaper]]
  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[250px_minmax(0,1fr)_260px]">
      <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block lg:self-start">
        <TarjetaPerfil user={user} ir={ir} n={user ? todos.filter((i) => i.owner === user.id).length : 0} />
        <nav className={caja + ' p-2'}>
          {filtros.map(([k, l, Ic]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${filtro === k ? 'bg-tierra font-medium text-white' : 'hover:bg-suave'}`}><Ic size={17} />{l}</button>
          ))}
        </nav>
      </aside>
      <section className="space-y-4">
        <div className={caja + ' flex items-center gap-3 p-4'}>
          {user ? <Avatar n={user.name} foto={user.foto} /> : <span className="grid h-10 w-10 place-items-center rounded-full bg-suave text-tenue"><User size={18} /></span>}
          <button onClick={() => ir('subir')} className="flex-1 rounded-full border border-borde px-4 py-2.5 text-left text-sm text-tenue hover:bg-suave">Comparte una tesis, un libro o una revista</button>
        </div>
        <label className={caja + ' relative block'}>
          <span className="sr-only">Buscar</span>
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-tenue" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título, autor o tema" className="w-full rounded-xl bg-transparent py-3 pl-11 pr-4" />
        </label>
        <div className="flex gap-2 overflow-x-auto lg:hidden">
          {filtros.map(([k, l]) => (
            <button key={k} onClick={() => setFiltro(k)} className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${filtro === k ? 'border-tierra bg-tierra text-white' : 'border-borde bg-fondo'}`}>{l}</button>
          ))}
        </div>
        <Feed lista={lista} {...acc} />
      </section>
      <aside className="hidden space-y-4 lg:sticky lg:top-24 lg:block lg:self-start">
        <div className={caja + ' p-4'}>
          <h3 className="font-serif font-semibold">Comunidad</h3>
          <ul className="mt-3 space-y-3">
            {autores.map(([o, p]) => (
              <li key={o} className="flex items-center gap-3"><Avatar n={nombreCompleto(p)} s={34} foto={p.foto_url} /><button onClick={() => ir('perfil', o)} className="min-w-0 truncate text-sm font-medium hover:text-tierra">{nombreCompleto(p)}</button></li>
            ))}
          </ul>
        </div>
        <div className={caja + ' p-4 text-sm text-tenue'}>
          <h3 className="font-serif font-semibold text-texto">Normas de la comunidad</h3>
          <p className="mt-2">Publica solo material académico. Se bloquea contenido obsceno, +18, gore o ilícito, y cualquier persona puede reportar una publicación.</p>
        </div>
      </aside>
    </div>
  )
}

function Feed({ lista, ...acc }) {
  if (!lista.length) return <div className={caja + ' p-8 text-center text-tenue'}>Aún no hay publicaciones aquí.</div>
  return lista.map((i) => <Post key={i.id} i={i} {...acc} />)
}

function Post({ i, user, liked, ir, onLike, onOpen, onReport, onShare, comentarios, onComentar, likesPor = {}, personas = {}, verPersonas, onBorrar, onEditar, onBorrarComentario }) {
  const { label, art, Icon } = TIPOS[i.t]
  const [abierto, setAbierto] = useState(false)
  const [txt, setTxt] = useState('')
  const cs = comentarios[i.id] || []
  const n = i.likes || 0
  const gestiona = !!user && (user.id === i.owner || user.es_admin)
  const b = 'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-tenue hover:bg-suave'
  const ib = 'rounded-full p-2 text-tenue hover:bg-suave'
  return (
    <article className={caja}>
      <div className="flex items-start gap-3 p-4 pb-2">
        <Avatar n={i.author} foto={i.foto} />
        <div className="min-w-0 flex-1">
          <button onClick={() => ir('perfil', i.owner)} className="font-semibold hover:text-tierra hover:underline">{i.author}</button>
          <p className="text-xs text-tenue">
            {i.gen ? `Generación ${i.gen}. ` : ''}Publicó {art}, {hace(i.fecha)}
            {i.oculta && <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 text-red-600">Oculta por reportes</span>}
          </p>
        </div>
        {gestiona && (
          <>
            <button onClick={() => onEditar(i)} aria-label="Editar publicación" title="Editar" className={ib}><Pencil size={16} /></button>
            <button onClick={() => onBorrar(i)} aria-label="Eliminar publicación" title="Eliminar" className={ib + ' hover:!text-red-600'}><Trash2 size={16} /></button>
          </>
        )}
        <button onClick={() => onReport(i.id)} aria-label="Reportar publicación" title="Reportar" className={ib}><Flag size={16} /></button>
      </div>
      <p className="px-4 pb-3 text-[15px]">{i.desc}</p>
      {i.prev ? (
        <button onClick={() => onOpen(i)} className="mb-3 block w-full overflow-hidden border-y border-borde bg-suave text-left hover:opacity-95">
          <img src={i.prev} alt={`Vista previa de ${i.title}`} loading="lazy" className="max-h-96 w-full object-cover object-top" />
          <span className="flex items-center gap-3 p-3">
            <Icon size={20} className="shrink-0 text-tierra" />
            <span className="min-w-0">
              <span className="block font-serif font-semibold leading-snug">{i.title}</span>
              <span className="text-xs text-tenue">{label}, {i.year}. Abrir documento</span>
            </span>
          </span>
        </button>
      ) : (
        <button onClick={() => onOpen(i)} className="mx-4 mb-3 flex w-[calc(100%-2rem)] items-center gap-4 overflow-hidden rounded-lg border border-borde bg-suave text-left hover:border-tierra">
          <span className="grid h-20 w-20 shrink-0 place-items-center bg-noche text-[#c9935f]"><Icon size={30} /></span>
          <span className="min-w-0 py-2 pr-3">
            <span className="block font-serif font-semibold leading-snug">{i.title}</span>
            <span className="text-xs text-tenue">{label}, {i.year}. Abrir documento</span>
          </span>
        </button>
      )}
      <div className="flex justify-between px-4 pb-2 text-xs text-tenue">
        <button onClick={() => n && verPersonas('Les gusta', likesPor[i.id] || [])} className={n ? 'hover:underline' : 'cursor-default'}>{n} me gusta</button>
        <button onClick={() => setAbierto(!abierto)} className="hover:underline">{cs.length} comentario(s)</button>
      </div>
      <div className="mx-4 flex gap-1 border-t border-borde py-1">
        <button onClick={() => onLike(i.id)} aria-pressed={!!liked[i.id]} className={b + (liked[i.id] ? ' !text-tierra' : '')}><Heart size={17} fill={liked[i.id] ? 'currentColor' : 'none'} />Me gusta</button>
        <button onClick={() => setAbierto(!abierto)} className={b}><MessageCircle size={17} />Comentar</button>
        <button onClick={onShare} className={b}><Share2 size={17} />Compartir</button>
      </div>
      {abierto && (
        <div className="space-y-3 border-t border-borde p-4">
          {cs.map((c, k) => (
            <div key={c.id ?? k} className="flex gap-2.5">
              <Avatar n={c.autor} s={32} foto={personas[c.autorId]?.foto_url} />
              <div className="min-w-0 flex-1 rounded-2xl bg-suave px-3.5 py-2"><p className="text-sm font-semibold">{c.autor}</p><p className="break-words text-sm">{c.texto}</p></div>
              {c.id && user && (user.id === c.autorId || user.es_admin) && (
                <button onClick={() => onBorrarComentario(i.id, c.id)} aria-label="Eliminar comentario" title="Eliminar comentario" className="self-center rounded-full p-1.5 text-tenue hover:text-red-600"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
          {user ? (
          <form onSubmit={async (e) => { e.preventDefault(); if (await onComentar(i.id, txt)) setTxt('') }} className="flex gap-2">
            <input value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={300} placeholder="Escribe un comentario" aria-label="Comentario" className="min-w-0 flex-1 rounded-full border border-borde bg-fondo px-4 py-2 text-sm" />
            <button aria-label="Enviar comentario" className="grid h-9 w-9 place-items-center rounded-full bg-tierra text-white"><Send size={16} /></button>
          </form>
          ) : (
            <button onClick={() => ir('login')} className="w-full rounded-full border border-borde px-4 py-2 text-sm text-tenue hover:border-tierra">Inicia sesión para comentar</button>
          )}
        </div>
      )}
    </article>
  )
}

const campo = 'w-full rounded-lg border border-borde bg-fondo px-3.5 py-2.5'
const etiqueta = 'mb-1.5 mt-4 block text-sm font-semibold'

const CLAVE_MIN = 8 // Debe coincidir con el mínimo en Supabase (Authentication > Providers > Email).

function Login() {
  const [crear, setCrear] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [cargando, setCargando] = useState(false)
  const [pendiente, setPendiente] = useState('') // correo que está esperando confirmación
  const [espera, setEspera] = useState(0)

  useEffect(() => {
    if (espera <= 0) return
    const t = setTimeout(() => setEspera((n) => n - 1), 1000)
    return () => clearTimeout(t)
  }, [espera])

  const reenviar = async (email) => {
    setErr(''); setInfo('')
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: window.location.origin } })
    if (error) {
      console.error(error)
      return setErr(/rate|seconds|limit/i.test(error.message) ? 'Espera un momento antes de pedir otro correo.' : 'No pudimos enviar el correo. Intenta de nuevo en unos minutos.')
    }
    setInfo('Te enviamos otro correo. Revisa también la carpeta de spam.'); setEspera(60)
  }

  const enviar = async (e) => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const email = fd.get('email').trim().toLowerCase(), clave = fd.get('clave')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErr('Escribe un correo válido.')
    if (crear) {
      // El dominio institucional se exige solo al crear cuentas nuevas; las cuentas ya existentes siempre pueden ingresar.
      if (!EMAIL_OK.test(email)) return setErr('Para crear una cuenta usa tu correo institucional (@alu.uct.cl o @uct.cl).')
      if (clave.length < CLAVE_MIN) return setErr(`La clave debe tener al menos ${CLAVE_MIN} caracteres.`)
      if (clave !== fd.get('clave2')) return setErr('Las claves no coinciden.')
    }
    setCargando(true); setErr(''); setInfo('')
    if (crear) {
      const { data, error } = await supabase.auth.signUp({ email, password: clave, options: { emailRedirectTo: window.location.origin } })
      setCargando(false)
      if (error) {
        console.error(error)
        if (/registered|already/i.test(error.message)) return setErr('Ese correo ya tiene cuenta. Ingresa con tu clave.')
        if (/rate|limit/i.test(error.message)) return setErr('Se enviaron demasiados correos. Espera unos minutos e inténtalo de nuevo.')
        const m = `${error.code || ''} ${error.message || ''}`
        if (/weak_password|password/i.test(m)) return setErr(`La clave es demasiado débil. Usa al menos ${CLAVE_MIN} caracteres, combinando letras y números.`)
        if (/sending|smtp/i.test(m)) return setErr('No se pudo enviar el correo de confirmación, así que la cuenta no se creó. Avisa al equipo: el servidor de correo no está bien configurado.')
        if (/database error/i.test(m)) return setErr('Ese correo no está autorizado para crear una cuenta en esta plataforma.')
        if (/signup_disabled|disabled/i.test(m)) return setErr('El registro de cuentas nuevas está desactivado por ahora.')
        return setErr(`No se pudo crear la cuenta. Inténtalo de nuevo; si sigue fallando, avisa al equipo (detalle: ${error.code || error.message}).`)
      }
      // Con la confirmación activada, un correo que ya existe no da error: vuelve sin identidades.
      if (data.user && data.user.identities?.length === 0) return setErr('Ese correo ya tiene cuenta. Ingresa con tu clave.')
      if (!data.session) { setPendiente(email); setEspera(60) }
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password: clave })
    setCargando(false)
    if (error) {
      if (error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message)) { setPendiente(email); setEspera(0); return }
      return setErr('Correo o clave incorrectos.')
    }
  }

  if (pendiente) return (
    <div className="mx-auto my-10 max-w-md rounded-2xl border border-borde bg-fondo p-7">
      <h2 className="font-serif text-2xl font-bold">Confirma tu correo</h2>
      <p className="mt-3 text-tenue">Enviamos un enlace a <b className="text-texto">{pendiente}</b>. Ábrelo para activar tu cuenta; después entrarás automáticamente.</p>
      <p className="mt-2 text-sm text-tenue">Si no lo ves, revisa la carpeta de spam o correo no deseado. Puede tardar unos minutos.</p>
      {info && <p className="mt-3 text-sm text-tierra">{info}</p>}
      {err && <p role="alert" className={cajaError}>{err}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={() => reenviar(pendiente)} disabled={espera > 0} className="rounded-full bg-tierra px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{espera > 0 ? `Reenviar en ${espera} s` : 'Reenviar correo'}</button>
        <button onClick={() => { setPendiente(''); setErr(''); setInfo('') }} className="rounded-full border border-borde px-4 py-2 text-sm">Volver</button>
      </div>
    </div>
  )

  return (
    <form onSubmit={enviar} className="mx-auto my-10 max-w-md rounded-2xl border border-borde bg-fondo p-7">
      <h2 className="font-serif text-2xl font-bold">{crear ? 'Crear cuenta' : 'Ingresar'}</h2>
      <p className="mt-2 text-tenue">{crear ? 'Usa tu correo institucional de la UCT. Te enviaremos un correo para confirmar que es tuyo.' : 'Ingresa con tu correo institucional UCT y tu clave.'}</p>
      <label htmlFor="email" className={etiqueta}>Correo institucional</label>
      <input id="email" name="email" type="email" required autoComplete="email" placeholder="nombre@alu.uct.cl" className={campo} />
      <label htmlFor="clave" className={etiqueta}>Clave</label>
      <input id="clave" name="clave" type="password" required autoComplete={crear ? 'new-password' : 'current-password'} className={campo} />
      {crear && (
        <>
          <label htmlFor="clave2" className={etiqueta}>Repite la clave</label>
          <input id="clave2" name="clave2" type="password" required autoComplete="new-password" className={campo} />
        </>
      )}
      <button disabled={cargando} className="mt-5 w-full rounded-full bg-tierra py-2.5 font-medium text-white disabled:opacity-60">{cargando ? 'Un momento…' : crear ? 'Crear cuenta' : 'Ingresar'}</button>
      {err && <p role="alert" className={cajaError}>{err}</p>}
      <p className="mt-4 text-center text-sm text-tenue">
        {crear ? '¿Ya tienes cuenta? ' : '¿No tienes cuenta? '}
        <button type="button" onClick={() => { setCrear(!crear); setErr('') }} className="font-medium text-tierra underline">{crear ? 'Ingresar' : 'Crear cuenta'}</button>
      </p>
    </form>
  )
}

const ent = (m) => (m ? ' !border-red-500' : '')
const cajaError = 'mt-4 rounded-lg border border-red-400 bg-red-500/10 px-3 py-2 text-sm text-red-600'
const TEL_OK = /^\+?[0-9 ()-]{8,20}$/

function Campo({ id, label, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className={etiqueta}>{label}</label>
      {children}
      {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : hint && <p className="mt-1 text-xs text-tenue">{hint}</p>}
    </div>
  )
}

const urlHttps = (v, host) => {
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : 'https://' + v)
    if (!u.hostname.includes('.')) return null
    if (host && !(u.hostname === host || u.hostname.endsWith('.' + host))) return null
    u.protocol = 'https:'
    return u.href
  } catch { return null }
}

function validarPerfil(d) {
  const e = {}
  if (!d.nombre) e.nombre = 'Escribe tu nombre.'
  if (!d.apellido) e.apellido = 'Escribe tu apellido.'
  if (!e.nombre && !e.apellido && isFlagged(`${d.nombre} ${d.apellido}`)) e.nombre = 'El nombre contiene términos no permitidos.'
  if (!d.generacion && !d.academico) e.generacion = 'Elige tu generación.'
  if (d.bio.length > 300) e.bio = 'La descripción no puede superar los 300 caracteres.'
  else if (d.bio && isFlagged(d.bio)) e.bio = 'La descripción contiene términos no permitidos (obsceno, +18, gore o ilícito).'
  if (d.ciudad.length > 80) e.ciudad = 'La ciudad no puede superar los 80 caracteres.'
  else if (d.ciudad && isFlagged(d.ciudad)) e.ciudad = 'La ciudad contiene términos no permitidos.'
  if (d.fecha) {
    const f = new Date(d.fecha)
    if (isNaN(f) || f < new Date('1930-01-01') || f > new Date()) e.fecha = 'Escribe una fecha de nacimiento válida.'
  }
  if (d.telefono && !TEL_OK.test(d.telefono)) e.telefono = 'Escribe un teléfono válido, por ejemplo +56 9 1234 5678.'
  const ig = d.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?].*$/, '')
  if (ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig)) e.instagram = 'Escribe solo tu usuario de Instagram, por ejemplo arqueologia_uct.'
  const li = d.linkedin ? urlHttps(d.linkedin, 'linkedin.com') : null
  if (d.linkedin && !li) e.linkedin = 'Pega el enlace de tu perfil de LinkedIn.'
  const web = d.sitio ? urlHttps(d.sitio) : null
  if (d.sitio && !web) e.sitio = 'Escribe una dirección web válida, por ejemplo https://orcid.org/0000-0000-0000-0000.'
  if (d.foto) {
    if (!/^image\/(jpeg|png|webp)$/.test(d.foto.type)) e.foto = 'La foto debe ser JPG, PNG o WEBP.'
    else if (d.foto.size > 2 * 1024 * 1024) e.foto = 'La foto no puede pesar más de 2 MB.'
  }
  return { e, ig, li, web }
}

function ConfigPerfil({ user, primera, onGuardar, onEliminar }) {
  const [e, setE] = useState({})
  const [err, setErr] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [vista, setVista] = useState(user.foto || null)
  const [bio, setBio] = useState(user.bio ?? '')
  const academico = (user.rol || rolDe(user.email)) === 'academico' // el tipo de cuenta lo fija el servidor
  const anio = new Date().getFullYear()
  const gens = Array.from({ length: anio - GEN_MIN + 1 }, (_, k) => anio - k)
  if (user.generacion && !gens.includes(user.generacion)) gens.unshift(user.generacion)
  const enviar = async (ev) => {
    ev.preventDefault()
    const fd = new FormData(ev.target)
    const t = (k) => (fd.get(k) || '').toString().trim()
    const foto = fd.get('foto')
    const d = {
      nombre: t('nombre'), apellido: t('apellido'), generacion: Number(fd.get('generacion')), bio: t('bio'), ciudad: t('ciudad'),
      fecha: t('fecha'), telefono: t('telefono'), instagram: t('instagram'), linkedin: t('linkedin'), sitio: t('sitio'), foto: foto?.size ? foto : null, academico,
    }
    const { e: errores, ig, li, web } = validarPerfil(d)
    setE(errores)
    if (Object.keys(errores).length) {
      setErr('Revisa los campos marcados en rojo.')
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    setErr(''); setGuardando(true)
    let msg
    try {
      msg = await onGuardar({
        nombre: d.nombre, apellido: d.apellido, generacion: d.generacion || null, foto: d.foto, bio: d.bio || null, ciudad: d.ciudad || null,
        instagram: ig || null, linkedin: li, sitio_web: web, fecha_nacimiento: d.fecha || null, telefono: d.telefono || null,
      })
    } catch (x) { console.error(x); msg = explicarError(x, 'guardar tu perfil') }
    setGuardando(false)
    if (msg) setErr(msg)
  }
  const titulo = 'mt-8 font-serif text-lg font-semibold'
  return (
    <form onSubmit={enviar} noValidate className="mx-auto my-10 max-w-lg rounded-2xl border border-borde bg-fondo p-7">
      <h2 className="font-serif text-2xl font-bold">{primera ? 'Completa tu perfil' : 'Editar perfil'}</h2>
      {primera && <p className="mt-2 text-tenue">Es tu primer ingreso. Lo obligatorio es el nombre, el apellido y la generación; el resto es opcional y puedes completarlo después.</p>}
      <div className="mt-5 flex items-center gap-4">
        <Avatar n={user.nombre || user.email} s={72} foto={vista} />
        <div>
          <label className="inline-block cursor-pointer rounded-full border border-borde px-4 py-1.5 text-sm hover:border-tierra">
            Subir foto (opcional)
            <input name="foto" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-invalid={!!e.foto} onChange={(ev) => { const f = ev.target.files[0]; if (f) setVista(URL.createObjectURL(f)) }} />
          </label>
          {e.foto && <p className="mt-1 text-sm text-red-600">{e.foto}</p>}
        </div>
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Campo id="nombre" label="Nombre" error={e.nombre}>
          <input id="nombre" name="nombre" maxLength={60} defaultValue={primera ? '' : user.nombre} autoComplete="given-name" aria-invalid={!!e.nombre} className={campo + ent(e.nombre)} />
        </Campo>
        <Campo id="apellido" label="Apellido" error={e.apellido}>
          <input id="apellido" name="apellido" maxLength={60} defaultValue={primera ? '' : user.apellido} autoComplete="family-name" aria-invalid={!!e.apellido} className={campo + ent(e.apellido)} />
        </Campo>
      </div>
      <Campo id="correo" label="Correo">
        <input id="correo" value={user.email} readOnly className={campo + ' text-tenue'} />
      </Campo>
      <p className="mt-4 text-sm text-tenue">Tipo de cuenta: <b className="font-semibold text-texto">{academico ? 'Académico/a' : 'Estudiante'}</b> (según tu correo @{user.email.split('@')[1]}).</p>
      {!academico && (
      <Campo id="generacion" label="Año de generación" error={e.generacion}>
        <select id="generacion" name="generacion" defaultValue={user.generacion ?? ''} aria-invalid={!!e.generacion} className={campo + ent(e.generacion)}>
          <option value="" disabled>Elige tu generación</option>
          {gens.map((g) => <option key={g} value={g}>Generación {g}</option>)}
        </select>
      </Campo>
      )}

      <h3 className={titulo}>Sobre ti (opcional)</h3>
      <Campo id="bio" label="Descripción" error={e.bio} hint={`${bio.length}/300. Cuenta qué estudias, qué te interesa o en qué trabajas.`}>
        <textarea id="bio" name="bio" rows={3} maxLength={300} value={bio} onChange={(ev) => setBio(ev.target.value)} aria-invalid={!!e.bio} className={campo + ent(e.bio)} />
      </Campo>
      <Campo id="ciudad" label="Ciudad" error={e.ciudad}>
        <select id="ciudad" name="ciudad" defaultValue={user.ciudad || 'Temuco'} aria-invalid={!!e.ciudad} className={campo + ent(e.ciudad)}>
          {CIUDADES.map(([region, lista]) => (
            <optgroup key={region} label={region}>{lista.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
          ))}
          <option value="Fuera de Chile">Fuera de Chile</option>
          {user.ciudad && !esCiudad(user.ciudad) && <option value={user.ciudad}>{user.ciudad}</option>}
        </select>
      </Campo>

      <h3 className={titulo}>Datos privados (opcional)</h3>
      <p className="text-sm text-tenue">Solo tú puedes ver tu fecha de nacimiento y tu teléfono. No se muestran en tu perfil.</p>
      <Campo id="fecha" label="Fecha de nacimiento" error={e.fecha}>
        <input id="fecha" name="fecha" type="date" min="1930-01-01" max={new Date().toISOString().slice(0, 10)} defaultValue={user.fecha_nacimiento ?? ''} aria-invalid={!!e.fecha} className={campo + ent(e.fecha)} />
      </Campo>
      <Campo id="telefono" label="Teléfono" error={e.telefono}>
        <input id="telefono" name="telefono" type="tel" maxLength={20} defaultValue={user.telefono ?? ''} placeholder="+56 9 1234 5678" autoComplete="tel" aria-invalid={!!e.telefono} className={campo + ent(e.telefono)} />
      </Campo>

      <h3 className={titulo}>Redes y enlaces (opcional)</h3>
      <Campo id="instagram" label="Instagram" error={e.instagram}>
        <input id="instagram" name="instagram" maxLength={60} defaultValue={user.instagram ?? ''} placeholder="usuario" aria-invalid={!!e.instagram} className={campo + ent(e.instagram)} />
      </Campo>
      <Campo id="linkedin" label="LinkedIn" error={e.linkedin}>
        <input id="linkedin" name="linkedin" maxLength={200} defaultValue={user.linkedin ?? ''} placeholder="https://www.linkedin.com/in/tu-perfil" aria-invalid={!!e.linkedin} className={campo + ent(e.linkedin)} />
      </Campo>
      <Campo id="sitio" label="Sitio web, ORCID o ResearchGate" error={e.sitio}>
        <input id="sitio" name="sitio" maxLength={200} defaultValue={user.sitio_web ?? ''} placeholder="https://" aria-invalid={!!e.sitio} className={campo + ent(e.sitio)} />
      </Campo>

      <button disabled={guardando} className="mt-7 w-full rounded-full bg-tierra py-2.5 font-medium text-white disabled:opacity-60">{guardando ? 'Guardando…' : primera ? 'Guardar y entrar' : 'Guardar cambios'}</button>
      {err && <p role="alert" className={cajaError}>{err}</p>}
      {!primera && onEliminar && <ZonaPeligro onEliminar={onEliminar} />}
    </form>
  )
}

// Archivos permitidos: documentos (PDF, EPUB) e imágenes (JPG, PNG, WEBP)
const MIME = { pdf: 'application/pdf', epub: 'application/epub+zip', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
const extDe = (f) => f.name.split('.').pop().toLowerCase()
const esImagen = (f) => ['jpg', 'jpeg', 'png', 'webp'].includes(extDe(f))
const validarDocumento = (f) => {
  if (!f) return 'Selecciona un archivo.'
  if (!MIME[extDe(f)]) return 'Formato no permitido. Sube un PDF, un EPUB o una imagen (JPG, PNG o WEBP).'
  if (f.size > ARCHIVO_MAX_MB * 1048576) return `El archivo supera los ${ARCHIVO_MAX_MB} MB.`
  return ''
}

// Vistas previas: se generan en el navegador y se guardan como JPG liviano.
async function reducirImagen(file, max = 1200) {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  const g = c.getContext('2d')
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
  g.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82))
}
async function miniaturaDePdf(file) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const page = await pdf.getPage(1)
  const vp = page.getViewport({ scale: 900 / page.getViewport({ scale: 1 }).width })
  const c = document.createElement('canvas')
  c.width = Math.round(vp.width); c.height = Math.round(vp.height)
  const g = c.getContext('2d')
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
  await page.render({ canvasContext: g, viewport: vp }).promise
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.8))
}
async function crearPrevia(file, miniatura) {
  try {
    if (miniatura) return await reducirImagen(miniatura)
    if (esImagen(file)) return await reducirImagen(file)
    if (extDe(file) === 'pdf') return await miniaturaDePdf(file)
  } catch (x) { console.warn('No se pudo crear la vista previa', x) }
  return null // sin vista previa: se muestra el ícono
}

function validarTextoPub({ title, desc, year }) {
  const e = {}
  if (title.length < 5) e.title = 'El título debe tener al menos 5 caracteres.'
  else if (isFlagged(title)) e.title = 'El título contiene términos no permitidos (obsceno, +18, gore o ilícito).'
  if (desc.length < 10) e.desc = 'El resumen debe tener al menos 10 caracteres. Cuéntanos de qué trata.'
  else if (isFlagged(desc)) e.desc = 'El resumen contiene términos no permitidos (obsceno, +18, gore o ilícito).'
  if (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 1) e.year = 'Escribe un año válido, entre 1900 y el año actual.'
  return e
}

function validarPublicacion({ title, desc, year, file, rights, miniatura }) {
  const e = validarTextoPub({ title, desc, year })
  const fe = validarDocumento(file)
  if (fe) e.file = fe
  else if (file.size === 0) e.file = 'El archivo está vacío. Revisa que sea el correcto.'
  else if (isFlagged(file.name)) e.file = 'El nombre del archivo contiene términos no permitidos. Cámbiale el nombre y vuelve a seleccionarlo.'
  if (miniatura) {
    if (!/^image\/(jpeg|png|webp)$/.test(miniatura.type)) e.mini = 'La miniatura debe ser una imagen JPG, PNG o WEBP.'
    else if (miniatura.size > 5 * 1048576) e.mini = 'La miniatura no puede pesar más de 5 MB.'
  }
  if (!rights) e.rights = 'Debes confirmar que eres autor/a o que cuentas con autorización.'
  return e
}

function Subir({ onPublicar }) {
  const [e, setE] = useState({})
  const [err, setErr] = useState('')
  const [publicando, setPublicando] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [desc, setDesc] = useState('')
  const [archivo, setArchivo] = useState(null)
  const [mini, setMini] = useState(null)
  const enviar = async (ev) => {
    ev.preventDefault()
    if (publicando) return
    const fd = new FormData(ev.target)
    const datos = { t: fd.get('t'), title: titulo.trim(), desc: desc.trim(), year: Number(fd.get('year')), file: archivo, miniatura: mini, rights: !!fd.get('rights') }
    const errores = validarPublicacion(datos)
    setE(errores)
    if (Object.keys(errores).length) {
      setErr('Revisa los campos marcados en rojo.')
      setTimeout(() => document.querySelector('[aria-invalid="true"]')?.focus(), 0)
      return
    }
    setErr(''); setPublicando(true)
    let msg
    try { msg = await onPublicar({ t: datos.t, title: datos.title, desc: datos.desc, year: datos.year }, archivo, mini) }
    catch (x) { console.error(x); msg = explicarError(x, 'publicar') }
    setPublicando(false)
    if (msg) setErr(msg)
  }
  return (
    <form onSubmit={enviar} noValidate className="mx-auto my-10 max-w-xl rounded-2xl border border-borde bg-fondo p-7">
      <h2 className="font-serif text-2xl font-bold">Subir a mi perfil</h2>
      <Campo id="t" label="Tipo">
        <select id="t" name="t" className={campo}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      </Campo>
      <Campo id="title" label="Título" error={e.title} hint={`${titulo.length}/140. Mínimo 5 caracteres.`}>
        <input id="title" value={titulo} onChange={(ev) => setTitulo(ev.target.value)} maxLength={140} aria-invalid={!!e.title} className={campo + ent(e.title)} />
      </Campo>
      <Campo id="year" label="Año" error={e.year}>
        <input id="year" name="year" type="number" defaultValue={new Date().getFullYear()} aria-invalid={!!e.year} className={campo + ent(e.year)} />
      </Campo>
      <Campo id="desc" label="Resumen" error={e.desc} hint={`${desc.length}/600. Mínimo 10 caracteres.`}>
        <textarea id="desc" rows={4} value={desc} onChange={(ev) => setDesc(ev.target.value)} maxLength={600} aria-invalid={!!e.desc} className={campo + ent(e.desc)} />
      </Campo>
      <Campo id="file" label="Archivo" error={e.file} hint={archivo ? `${archivo.name}, ${(archivo.size / 1048576).toFixed(1)} MB` : `PDF, EPUB o imagen (JPG, PNG, WEBP). Máximo ${ARCHIVO_MAX_MB} MB.`}>
        <input id="file" type="file" accept=".pdf,.epub,.jpg,.jpeg,.png,.webp" onChange={(ev) => setArchivo(ev.target.files[0] ?? null)} aria-invalid={!!e.file} className={campo + ent(e.file)} />
      </Campo>
      <Campo id="mini" label="Miniatura (opcional)" error={e.mini} hint={mini ? mini.name : 'Es la imagen que se ve en el inicio. Si no subes una, se usa la primera página del PDF o la propia imagen.'}>
        <input id="mini" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(ev) => setMini(ev.target.files[0] ?? null)} aria-invalid={!!e.mini} className={campo + ent(e.mini)} />
      </Campo>
      <label className="mt-4 flex items-start gap-2 text-sm"><input name="rights" type="checkbox" aria-invalid={!!e.rights} className="mt-1" />Soy autor/a o cuento con autorización para publicar este material, y es de carácter académico.</label>
      {e.rights && <p className="mt-1 text-sm text-red-600">{e.rights}</p>}
      <button disabled={publicando} className="mt-6 w-full rounded-full bg-tierra py-2.5 font-medium text-white disabled:opacity-60">{publicando ? 'Publicando…' : 'Publicar'}</button>
      {err && <p role="alert" className={cajaError}>{err}</p>}
      <p className="mt-3 text-sm text-tenue">Un filtro automático bloquea texto obsceno, +18, gore o ilícito. Cualquier usuario puede reportar una publicación.</p>
    </form>
  )
}

function Modal({ titulo, onClose, children }) {
  useEffect(() => {
    const f = (ev) => ev.key === 'Escape' && onClose()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={titulo} onClick={(ev) => ev.stopPropagation()} className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-borde bg-fondo p-6">
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-serif text-xl font-bold">{titulo}</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full p-1 hover:bg-suave"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ListaPersonas({ titulo, ids, personas, user, seg, toggleSeguir, ir, onClose }) {
  const lista = [...new Set(ids)].map((id) => [id, personas[id]]).filter(([, p]) => p)
  return (
    <Modal titulo={titulo} onClose={onClose}>
      {lista.length === 0 ? <p className="mt-4 text-tenue">Todavía no hay nadie aquí.</p> : (
        <ul className="mt-4 space-y-3">
          {lista.map(([id, p]) => {
            const nombre = nombreCompleto(p)
            const sigo = seg.some((s) => s.seguidor_id === user?.id && s.seguido_id === id)
            return (
              <li key={id} className="flex items-center gap-3">
                <Avatar n={nombre} s={40} foto={p.foto_url} />
                <button onClick={() => { onClose(); ir('perfil', id) }} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-medium hover:text-tierra">{nombre}</span>
                  {p.generacion && <span className="text-xs text-tenue">Generación {p.generacion}</span>}
                </button>
                {user && id !== user.id && (
                  <button onClick={() => toggleSeguir(id)} className={`rounded-full border px-3 py-1 text-sm ${sigo ? 'border-borde' : 'border-tierra bg-tierra text-white'}`}>{sigo ? 'Siguiendo' : 'Seguir'}</button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}

function ConfirmarBorrado({ item, onConfirm, onClose }) {
  const [trabajando, setTrabajando] = useState(false)
  const [err, setErr] = useState('')
  const borrar = async () => {
    setTrabajando(true); setErr('')
    let msg
    try { msg = await onConfirm(item) } catch (x) { console.error(x); msg = explicarError(x, 'eliminar la publicación') }
    setTrabajando(false)
    if (msg) setErr(msg)
  }
  return (
    <Modal titulo="¿Eliminar esta publicación?" onClose={onClose}>
      <p className="mt-3 text-sm">«{item.title}» se eliminará junto con sus comentarios, sus me gusta y sus archivos. Esta acción no se puede deshacer.</p>
      {err && <p role="alert" className={cajaError}>{err}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-full border border-borde px-4 py-1.5 text-sm">Cancelar</button>
        <button onClick={borrar} disabled={trabajando} className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60">{trabajando ? 'Eliminando…' : 'Sí, eliminar'}</button>
      </div>
    </Modal>
  )
}

function EditarPub({ item, onGuardar, onClose }) {
  const [e, setE] = useState({})
  const [err, setErr] = useState('')
  const [titulo, setTitulo] = useState(item.title)
  const [desc, setDesc] = useState(item.desc)
  const [trabajando, setTrabajando] = useState(false)
  const enviar = async (ev) => {
    ev.preventDefault()
    const fd = new FormData(ev.target)
    const d = { t: fd.get('t'), title: titulo.trim(), desc: desc.trim(), year: Number(fd.get('year')) }
    const errores = validarTextoPub(d)
    setE(errores)
    if (Object.keys(errores).length) return setErr('Revisa los campos marcados en rojo.')
    setErr(''); setTrabajando(true)
    let msg
    try { msg = await onGuardar(item, d) } catch (x) { console.error(x); msg = explicarError(x, 'guardar los cambios') }
    setTrabajando(false)
    if (msg) setErr(msg)
  }
  return (
    <Modal titulo="Editar publicación" onClose={onClose}>
      <form onSubmit={enviar} noValidate>
        <Campo id="et" label="Tipo">
          <select id="et" name="t" defaultValue={item.t} className={campo}>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </Campo>
        <Campo id="etitle" label="Título" error={e.title} hint={`${titulo.length}/140. Mínimo 5 caracteres.`}>
          <input id="etitle" value={titulo} onChange={(ev) => setTitulo(ev.target.value)} maxLength={140} aria-invalid={!!e.title} className={campo + ent(e.title)} />
        </Campo>
        <Campo id="eyear" label="Año" error={e.year}>
          <input id="eyear" name="year" type="number" defaultValue={item.year} aria-invalid={!!e.year} className={campo + ent(e.year)} />
        </Campo>
        <Campo id="edesc" label="Resumen" error={e.desc} hint={`${desc.length}/600. Mínimo 10 caracteres.`}>
          <textarea id="edesc" rows={4} value={desc} onChange={(ev) => setDesc(ev.target.value)} maxLength={600} aria-invalid={!!e.desc} className={campo + ent(e.desc)} />
        </Campo>
        {err && <p role="alert" className={cajaError}>{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-borde px-4 py-1.5 text-sm">Cancelar</button>
          <button disabled={trabajando} className="rounded-full bg-tierra px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60">{trabajando ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </form>
    </Modal>
  )
}

function ZonaPeligro({ onEliminar }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [err, setErr] = useState('')
  const cerrar = () => { if (!trabajando) { setAbierto(false); setTexto(''); setErr('') } }
  const borrar = async () => {
    setTrabajando(true); setErr('')
    let msg
    try { msg = await onEliminar() } catch (x) { console.error(x); msg = explicarError(x, 'eliminar tu perfil') }
    setTrabajando(false)
    if (msg) setErr(msg)
  }
  return (
    <div className="mt-10 rounded-lg border border-red-400 p-4">
      <h3 className="font-serif text-lg font-semibold text-red-600">Eliminar mi perfil</h3>
      <p className="mt-1 text-sm text-tenue">Borra tu cuenta, tus publicaciones, comentarios, me gusta y seguidores. No se puede recuperar.</p>
      <button type="button" onClick={() => setAbierto(true)} className="mt-3 rounded-full border border-red-500 px-4 py-1.5 text-sm text-red-600 hover:bg-red-500/10">Eliminar mi perfil permanentemente</button>
      {abierto && (
        <Modal titulo="¿Eliminar tu perfil para siempre?" onClose={cerrar}>
          <p className="mt-3 text-sm">Vas a perder tu perfil, todo lo que publicaste y tus seguidores. <b>Esta acción es permanente y no se puede deshacer.</b></p>
          <label htmlFor="confirmar" className={etiqueta}>Para confirmar, escribe ELIMINAR</label>
          <input id="confirmar" value={texto} onChange={(ev) => setTexto(ev.target.value)} onKeyDown={(ev) => ev.key === 'Enter' && ev.preventDefault()} autoComplete="off" className={campo} />
          {err && <p role="alert" className={cajaError}>{err}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={cerrar} className="rounded-full border border-borde px-4 py-1.5 text-sm">Cancelar</button>
            <button type="button" onClick={borrar} disabled={texto.trim().toUpperCase() !== 'ELIMINAR' || trabajando} className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40">{trabajando ? 'Eliminando…' : 'Eliminar para siempre'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Perfil({ email, todos, ...acc }) {
  const { seg = [], user } = acc
  const lista = todos.filter((i) => i.owner === email).sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0))
  const propio = user?.id === email
  const d = (propio ? user : acc.personas?.[email]) ?? {}
  const nombre = d.nombre ? `${d.nombre} ${d.apellido}`.trim() : (lista[0]?.author ?? 'Autor/a')
  const seguidores = seg.filter((s) => s.seguido_id === email).map((s) => s.seguidor_id)
  const siguiendo = seg.filter((s) => s.seguidor_id === email).map((s) => s.seguido_id)
  const yoSigo = !!user && seguidores.includes(user.id)
  const enlaces = [
    d.instagram && [`https://instagram.com/${d.instagram}`, Instagram, `@${d.instagram}`],
    d.linkedin && [d.linkedin, Linkedin, 'LinkedIn'],
    d.sitio_web && [d.sitio_web, Globe, 'Sitio web'],
  ].filter(Boolean)
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
      <div className={caja + ' overflow-hidden'}>
        <div className="bg-noche pt-16"><Estratos /></div>
        <div className="-mt-10 px-6 pb-5">
          <span className="inline-block rounded-full ring-4 ring-fondo"><Avatar n={nombre} s={80} foto={d.foto_url} /></span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-2xl font-bold">{nombre}</h2>
            {d.es_admin && <span className="inline-flex items-center gap-1 rounded border border-tierra bg-tierra/15 px-2 py-0.5 text-xs font-semibold text-tierra"><Shield size={12} />Admin</span>}
          </div>
          {d.handle && <p className="text-sm text-tenue">@{d.handle}</p>}
          <p className="mt-1 text-sm"><b className="font-semibold">{d.rol === 'academico' ? 'Académico/a' : 'Estudiante'}</b>{d.generacion ? `, Generación ${d.generacion}` : ''}</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span><b className="font-semibold">{lista.length}</b> publicaciones</span>
            <button onClick={() => acc.verPersonas('Seguidores', seguidores)} className="hover:underline"><b className="font-semibold">{seguidores.length}</b> seguidores</button>
            <button onClick={() => acc.verPersonas('Siguiendo', siguiendo)} className="hover:underline"><b className="font-semibold">{siguiendo.length}</b> siguiendo</button>
          </div>
          {d.ciudad && <p className="mt-2 flex items-center gap-1.5 text-sm text-tenue"><MapPin size={14} />{d.ciudad}</p>}
          {d.bio && <p className="mt-3 whitespace-pre-line text-[15px]">{d.bio}</p>}
          {enlaces.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {enlaces.map(([href, Ic, txt]) => (
                <a key={txt} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-borde px-3 py-1 text-sm hover:border-tierra"><Ic size={14} />{txt}</a>
              ))}
            </div>
          )}
          {propio
            ? <button onClick={() => acc.ir('config')} className="mt-4 rounded-full border border-borde px-4 py-1.5 text-sm hover:border-tierra">Editar perfil</button>
            : <button onClick={() => acc.toggleSeguir(email)} className={`mt-4 rounded-full border px-5 py-1.5 text-sm font-medium ${yoSigo ? 'border-borde' : 'border-tierra bg-tierra text-white'}`}>{yoSigo ? 'Siguiendo' : 'Seguir'}</button>}
        </div>
      </div>
      <Feed lista={lista} {...acc} />
    </div>
  )
}

function AdminPanel({ todos, avisar, cargar, onOpen, onBorrar, ir, user }) {
  const [tab, setTab] = useState('reportes')
  const [reportes, setReportes] = useState(null)
  const [usuarios, setUsuarios] = useState(null)
  const [err, setErr] = useState('')
  const recargar = useCallback(async () => {
    const [r, u] = await Promise.all([
      supabase.from('reportes').select('publicacion_id'),
      supabase.from('perfiles').select('id,nombre,apellido,generacion,aprobado,es_admin,configurado').order('creado', { ascending: false }),
    ])
    const fallo = r.error || u.error
    if (fallo) { console.error(fallo); setErr(explicarError(fallo, 'cargar el panel')); return }
    setErr(''); setReportes(r.data); setUsuarios(u.data)
  }, [])
  useEffect(() => { recargar() }, [recargar])
  const accion = async (fn, args, ok) => {
    const { error } = await supabase.rpc(fn, args)
    if (error) { console.error(error); return avisar(explicarError(error, 'completar la acción')) }
    avisar(ok); await recargar(); cargar()
  }
  const cuentas = {}
  for (const r of reportes || []) cuentas[r.publicacion_id] = (cuentas[r.publicacion_id] || 0) + 1
  const marcadas = todos.filter((i) => cuentas[i.id] || i.oculta).sort((a, b) => (cuentas[b.id] || 0) - (cuentas[a.id] || 0))
  const bt = 'rounded-full border border-borde px-3 py-1 text-sm hover:border-tierra'
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
      <div className={caja + ' p-5'}>
        <h2 className="flex items-center gap-2 font-serif text-2xl font-bold"><Shield size={22} />Panel de administración</h2>
        <p className="mt-1 text-sm text-tenue">Como admin también puedes editar y eliminar cualquier publicación o comentario desde el inicio.</p>
        <div className="mt-4 flex gap-2">
          {[['reportes', 'Reportes'], ['usuarios', 'Usuarios']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-full border px-4 py-1.5 text-sm ${tab === k ? 'border-tierra bg-tierra text-white' : 'border-borde'}`}>{l}{k === 'reportes' && marcadas.length > 0 ? ` (${marcadas.length})` : ''}</button>
          ))}
        </div>
        {err && <p role="alert" className={cajaError}>{err}</p>}
      </div>
      {tab === 'reportes' && (
        reportes === null ? <p className="p-4 text-tenue">Cargando…</p>
          : marcadas.length === 0 ? <div className={caja + ' p-6 text-center text-tenue'}>No hay publicaciones reportadas ni ocultas.</div>
            : marcadas.map((i) => (
              <div key={i.id} className={caja + ' p-4'}>
                <p className="font-serif font-semibold">{i.title}</p>
                <p className="text-sm text-tenue">{i.author}. {cuentas[i.id] || 0} reporte(s){i.oculta ? '. Oculta para la comunidad' : ''}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => onOpen(i)} className={bt}>Abrir documento</button>
                  <button onClick={() => accion('admin_restaurar', { pub: i.id }, 'Publicación restaurada')} className={bt}>Mantener visible y descartar reportes</button>
                  <button onClick={() => onBorrar(i)} className={bt + ' !text-red-600'}>Eliminar</button>
                </div>
              </div>
            ))
      )}
      {tab === 'usuarios' && (
        usuarios === null ? <p className="p-4 text-tenue">Cargando…</p> : (
          <div className={caja + ' divide-y divide-borde'}>
            {usuarios.map((u) => {
              const yo = u.id === user.id
              return (
                <div key={u.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <button onClick={() => ir('perfil', u.id)} className="font-medium hover:text-tierra hover:underline">{u.configurado ? `${u.nombre} ${u.apellido}` : `${u.nombre} (perfil sin completar)`}</button>
                    <p className="text-xs text-tenue">{u.generacion ? `Generación ${u.generacion}. ` : ''}{u.es_admin ? 'Admin. ' : ''}{u.aprobado ? '' : 'Suspendida.'}</p>
                  </div>
                  {!yo && (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => accion('admin_set_admin', { uid: u.id, valor: !u.es_admin }, u.es_admin ? 'Ya no es admin' : 'Ahora es admin')} className={bt}>{u.es_admin ? 'Quitar admin' : 'Hacer admin'}</button>
                      <button onClick={() => accion('admin_set_aprobado', { uid: u.id, valor: !u.aprobado }, u.aprobado ? 'Cuenta suspendida' : 'Cuenta reactivada')} className={bt}>{u.aprobado ? 'Suspender' : 'Reactivar'}</button>
                      <button onClick={() => { if (window.confirm(`¿Eliminar la cuenta de ${u.nombre} ${u.apellido} y todo lo que publicó? No se puede deshacer.`)) accion('admin_eliminar_usuario', { uid: u.id }, 'Cuenta eliminada') }} className={bt + ' !text-red-600'}>Eliminar</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t-[6px] border-tierra bg-[#151311] px-5 py-7 text-center text-sm text-[#d9cfc4]">
      <p>© 2026 Repositorio Arqueología UCT. Carrera de Arqueología, Universidad Católica de Temuco, Chile. Todos los derechos reservados.</p>
      <p className="mt-1">Líder representativo del Centro de Estudiantes de Arqueología: Vicente Mujica Valladares.</p>
      <p className="mt-1">Programación y diseño web: Benjamín Rodríguez Valladares (UCM). © 2026 Todos los derechos reservados.</p>
    </footer>
  )
}
