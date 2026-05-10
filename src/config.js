// ============================================================================
// CONFIGURACIÓN DE CONEXIÓN
// ============================================================================
// Estas dos constantes las llenas DESPUÉS de desplegar el Apps Script
// (paso 9 de la guía). Mientras estén vacías, la app funciona en modo lectura
// y las capturas se quedan en cola local sin escribir al Sheet.
// ============================================================================

export const APPS_SCRIPT_URL = ''
// Ejemplo: 'https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxx/exec'

export const SHARED_SECRET = 'cambiame-en-produccion'
// IMPORTANTE: este mismo valor debe estar también en el Apps Script (Code.gs).

// ============================================================================
// METADATOS DEL PROYECTO ACTUAL
// ============================================================================
// Para usar este sistema en otra obra, solo cambia estos valores y el
// archivo scripts/config.json. El código de la app queda igual.
// ============================================================================

export const PROJECT = {
  name: 'YOD San Fco — Control Obra Negra',
  shortName: 'YOD San Fco',
  startDate: '2026-04-01', // Lunes de la semana 1
  totalWeeks: 18,
}
