// Filtro de contenido. Hoy corre en el navegador; cuando llegue Supabase,
// la misma lógica debe repetirse en el servidor (Edge Function), porque el
// filtro del cliente se puede saltar.

const PALABRAS = [
  'xxx', 'nsfw', '+18', '18+', 'gore', 'snuff', 'erotico', 'erotica',
  'sexo explicito', 'pornografia infantil', 'venta de droga', 'vendo droga',
  'armas ilegales', 'venta de piezas arqueologicas',
]
const RAICES = ['porno', 'pedofil', 'descuartiz', 'mutilacion']

export const ARCHIVO_MAX_MB = 25

const normalizar = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function isFlagged(texto) {
  const n = ' ' + normalizar(texto).replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ') + ' '
  return PALABRAS.some((w) => n.includes(' ' + w + ' ')) || RAICES.some((w) => n.includes(w))
}

export function validarArchivo(file) {
  if (!file || !file.name) return 'Selecciona un archivo.'
  if (!/\.(pdf|epub)$/i.test(file.name)) return 'Solo se permiten archivos PDF o EPUB.'
  if (file.size > ARCHIVO_MAX_MB * 1024 * 1024) return `El archivo supera los ${ARCHIVO_MAX_MB} MB.`
  return ''
}
