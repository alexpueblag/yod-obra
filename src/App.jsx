import React, { useEffect, useMemo, useRef, useState } from 'react'
import { APPS_SCRIPT_URL, SHARED_SECRET, PROJECT } from './config.js'

// ============================================================================
// CATÁLOGOS BASE (genéricos, modificables desde la hoja Catalogos del Sheet)
// ============================================================================

const stages = [
  { code: 'CIM', name: 'Cimentación', weight: 0 },
  { code: 'PB1', name: 'PB arranque', weight: 1 },
  { code: 'PB2', name: 'PB cierre', weight: 2 },
  { code: 'LE', name: 'Losa entrepiso', weight: 3 },
  { code: 'PA1', name: 'PA arranque', weight: 4 },
  { code: 'PA2', name: 'PA cierre', weight: 5 },
  { code: 'LA', name: 'Losa azotea', weight: 6 },
  { code: 'REM', name: 'Remates', weight: 7 },
]

const weeks = Array.from({ length: PROJECT.totalWeeks }, (_, i) => `S${i + 1}`)
const stageByCode = Object.fromEntries(stages.map((s) => [s.code, s]))

const users = [
  { id: 'dir-alejandro', name: 'Alejandro', role: 'Dirección', note: 'Ve todo, decide y edita plan maestro.' },
  { id: 'residente', name: 'Residente de obra', role: 'Residente', note: 'Captura campo: avance, restricciones, asistencia, almacén, solicitudes.' },
  { id: 'supervisor', name: 'Supervisor de obra', role: 'Supervisor', note: 'Valida calidad, libera etapas/colados, autoriza destajos y cierres.' },
  { id: 'admin', name: 'Administradora', role: 'Administración', note: 'Ve materiales, nómina, destajos y reportes. No captura contratistas.' },
  { id: 'sistema', name: 'Admin sistema', role: 'Admin sistema', note: 'Configura catálogos, usuarios, permisos y respaldo.' },
]

const roleAccent = {
  Dirección: 'bg-ink text-paper border-ink',
  Residente: 'bg-release text-paper border-release',
  Supervisor: 'bg-info text-paper border-info',
  Administración: 'bg-warning text-paper border-warning',
  'Admin sistema': 'bg-construction text-paper border-construction',
}

const roleModules = {
  Dirección: ['home', 'dashboard', 'plan', 'houses', 'houseFile', 'daily', 'restrictions', 'lookahead', 'stageRelease', 'pourRelease', 'quality', 'warehouse', 'materials', 'attendance', 'payroll', 'piecework', 'productivity', 'weeklyReport', 'crews', 'catalogs', 'sheetSync'],
  Residente: ['home', 'houses', 'houseFile', 'daily', 'dailyClose', 'restrictions', 'lookahead', 'stageRelease', 'pourRelease', 'warehouse', 'attendance', 'materials', 'routine', 'sheetSync'],
  Supervisor: ['home', 'criticalInbox', 'houses', 'houseFile', 'daily', 'restrictions', 'lookahead', 'stageRelease', 'pourRelease', 'quality', 'warehouse', 'materials', 'attendance', 'piecework', 'weeklyReport', 'routine', 'sheetSync'],
  Administración: ['home', 'dashboard', 'houses', 'houseFile', 'materials', 'warehouse', 'attendance', 'payroll', 'piecework', 'productivity', 'weeklyReport', 'sheetSync'],
  'Admin sistema': ['home', 'dashboard', 'plan', 'houses', 'houseFile', 'criticalInbox', 'daily', 'dailyClose', 'restrictions', 'lookahead', 'stageRelease', 'pourRelease', 'quality', 'warehouse', 'materials', 'attendance', 'payroll', 'piecework', 'productivity', 'weeklyReport', 'crews', 'catalogs', 'routine', 'sheetSync'],
}

const moduleList = [
  { key: 'home', label: 'Mi trabajo' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'plan', label: 'Plan maestro' },
  { key: 'houses', label: 'Avance casas' },
  { key: 'houseFile', label: 'Ficha por casa' },
  { key: 'daily', label: 'Control diario' },
  { key: 'dailyClose', label: 'Cierre diario' },
  { key: 'restrictions', label: 'Restricciones' },
  { key: 'lookahead', label: 'Lookahead 3S' },
  { key: 'stageRelease', label: 'Liberación etapa' },
  { key: 'pourRelease', label: 'Pre-colado' },
  { key: 'quality', label: 'Calidad' },
  { key: 'criticalInbox', label: 'Bandeja crítica' },
  { key: 'warehouse', label: 'Almacén' },
  { key: 'materials', label: 'Materiales 2S' },
  { key: 'attendance', label: 'Asistencia' },
  { key: 'payroll', label: 'Nómina' },
  { key: 'piecework', label: 'Destajos' },
  { key: 'productivity', label: 'Productividad' },
  { key: 'weeklyReport', label: 'Reporte semanal' },
  { key: 'crews', label: 'Cuadrillas' },
  { key: 'catalogs', label: 'Catálogos' },
  { key: 'routine', label: 'Rutina por rol' },
  { key: 'sheetSync', label: 'Sheets' },
]

const sheetMap = {
  dailyLogs: { label: 'Control diario', sheetName: 'Control_Diario' },
  restrictions: { label: 'Restricciones', sheetName: 'Restricciones_Diario' },
  lookahead: { label: 'Lookahead 3 semanas', sheetName: 'Lookahead_3S_M' },
  stageReleases: { label: 'Liberación de etapa', sheetName: 'Liberacion_Etapa' },
  pourReleases: { label: 'Pre-colado', sheetName: 'Liberacion_Colado' },
  warehouse: { label: 'Almacén', sheetName: 'Almacén_Diario' },
  attendance: { label: 'Asistencia', sheetName: 'Asistencia_Diario' },
  qualityLogs: { label: 'Calidad', sheetName: 'Calidad_Diario' },
  piecework: { label: 'Destajos', sheetName: 'Destajos_J' },
  materialForecasts: { label: 'Materiales 2S', sheetName: 'Materiales_2S_V' },
  weeklyReport: { label: 'Reporte semanal', sheetName: 'Reporte_Semanal_S' },
}

// ============================================================================
// ESTADO INICIAL VACÍO + CARGA DESDE data.json
// ============================================================================

function makeEmptyState() {
  return {
    meta: { projectName: PROJECT.name, currentWeek: 1, lastUpdated: new Date().toISOString() },
    houses: Array.from({ length: 15 }, (_, i) => ({ id: `C${i + 1}`, code: `C${i + 1}`, startWeek: 1 })),
    users,
    sheetQueue: [],
    dailyLogs: [],
    restrictions: [],
    lookahead: [],
    stageReleases: [],
    pourReleases: [],
    qualityLogs: [],
    warehouse: [],
    materialForecasts: [],
    attendance: [],
    piecework: [],
    crewsPlan: weeks.map((w) => ({ week: w, startsPlan: 0, alba: 0, block: 0, losa: 0, ep: 0, closuresPlan: 0, notes: '' })),
    catalogs: {
      activityStatus: ['No inicia', 'En proceso', 'Liberado', 'Atorado', 'Reprogramado'],
      restrictionStatus: ['Abierta', 'En proceso', 'Cerrada', 'Reprogramada'],
      paymentDecision: ['Pagar', 'Pagar Parcial', 'Retener', 'No procede'],
      qualityResult: ['Cumple', 'No Cumple', 'Cumple con Observación'],
      attendanceCodes: ['P', 'MD', 'F', 'D', 'V', 'I'],
      yesNoNa: ['Sí', 'No', 'N/A'],
      crews: ['A-1', 'A-2', 'A-3', 'A-4', 'B-1', 'B-2', 'B-3', 'L-1', 'L-2', 'E-1', 'E-2', 'P-1', 'P-2', 'C-1', 'F-1'],
      materials: ['Block 12x20x40', 'Cemento gris', 'Arena', 'Grava', 'Varilla #3 3/8', 'Varilla #3 1/2', 'Vigueta', 'Bovedilla', 'Conduit 1/2"', 'PVC sanitario 4"', 'CPVC 1/2"'],
    },
    routine: {
      Residente: [
        { day: 'Lunes', task: 'Asistencia, control diario, almacén, restricciones, liberaciones si aplica', minutes: 30, objective: 'Establecer plan semanal y revisar pendientes arrastrados' },
        { day: 'Miércoles', task: 'Lookahead 3S', minutes: 60, objective: 'Anticiparse a retos de las siguientes semanas' },
        { day: 'Jueves', task: 'Destajos preliminares', minutes: 60, objective: 'Medir avance real para que supervisor autorice' },
        { day: 'Viernes', task: 'Materiales críticos', minutes: 30, objective: 'Revisar materiales para siguientes semanas' },
        { day: 'Sábado', task: 'Productividad y cierre operativo', minutes: 90, objective: 'Cerrar semana y dejar lunes claro' },
      ],
      Supervisor: [
        { day: 'Lunes', task: 'Calidad, control diario, restricciones y liberaciones', minutes: 20, objective: 'Detectar atrasos heredados' },
        { day: 'Miércoles', task: 'Validar Lookahead', minutes: 45, objective: 'Revisar frentes y materiales futuros' },
        { day: 'Jueves', task: 'Autorizar destajos y asistencia', minutes: 30, objective: 'No pagar con errores' },
        { day: 'Viernes', task: 'Materiales 2S', minutes: 20, objective: 'Preparar insumo de reporte semanal' },
        { day: 'Sábado', task: 'Reporte semanal', minutes: 15, objective: 'Cerrar riesgos y prioridades' },
      ],
      Administración: [
        { day: 'Lunes', task: 'Revisar materiales, nómina y destajos pendientes', minutes: 30, objective: 'Detectar pagos o compras en riesgo' },
        { day: 'Jueves', task: 'Revisar destajos autorizables', minutes: 45, objective: 'Preparar pagos sin capturas incompletas' },
        { day: 'Sábado', task: 'Revisar reporte semanal y nómina', minutes: 45, objective: 'Cerrar números de la semana' },
      ],
    },
    weeklyReports: [],
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function cn(...parts) { return parts.filter(Boolean).join(' ') }
function money(n) { return Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }) }
function pct(n) { return `${Math.round(Number(n || 0) * 100)}%` }
function nextId(arr) { return Math.max(0, ...arr.map((x) => Number(x.id || 0))) + 1 }
function updateById(arr, id, patch) { return arr.map((x) => (x.id === id ? { ...x, ...patch } : x)) }
function plannedStageFor(house, weekNum) { const offset = weekNum - house.startWeek; return offset < 0 || offset > 7 ? null : stages[offset] }
function attendanceFactor(code) { return { P: 1, MD: 0.5, F: 0, D: 0, V: 1, I: 1 }[code] ?? 0 }
function payrollRow(a) { const paidDays = Object.values(a.days || {}).reduce((s, c) => s + attendanceFactor(c), 0); const base = paidDays * Number(a.wage || 0); return { paidDays, base, net: base + Number(a.extra || 0) + Number(a.bonus || 0) - Number(a.discount || 0) } }
function pieceworkAmount(p) { const base = Number(p.quantity || 0) * Number(p.unitPrice || 0); const pctVal = p.paymentDecision === 'Pagar' ? 100 : p.paymentDecision === 'Pagar Parcial' ? Number(p.authorizedPercent || 0) : 0; return base * (pctVal / 100) }
function materialRisk(m) { const projected = Number(m.currentStock || 0) - Number(m.consumption1 || 0) - Number(m.consumption2 || 0); if (projected < 0 && m.inbound !== 'Sí') return 'Rojo'; if (projected < 0 && m.inbound === 'Sí') return 'Amarillo'; if (projected < Number(m.consumption2 || 0) * 0.25) return 'Amarillo'; return 'Verde' }
function autoWeekFromDate(dateValue) { if (!dateValue) return 'S1'; const d = new Date(dateValue + 'T00:00:00'); if (Number.isNaN(d.getTime())) return 'S1'; const start = new Date(PROJECT.startDate + 'T00:00:00'); const diffDays = Math.max(0, Math.floor((d - start) / 86400000)); return `S${Math.min(PROJECT.totalWeeks, Math.floor(diffDays / 7) + 1)}` }
function makeUid(entity) { return `${entity}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}` }
function hasOpenQuality(data, house, stage) { return data.qualityLogs.some((q) => q.house === house && (!stage || q.stage === stage) && q.closure === 'Abierto') }
function blockerReasons(data, house, stage) { const reasons = []; data.restrictions.filter((r) => r.house === house && (!stage || r.stage === stage) && r.status !== 'Cerrada' && r.affectsProjection).forEach((r) => reasons.push(`Restricción abierta: ${r.title}`)); data.qualityLogs.filter((q) => q.house === house && (!stage || q.stage === stage) && q.closure === 'Abierto').forEach((q) => reasons.push(`Calidad abierta: ${q.review}`)); return reasons }
function checklistIssues(p) { const labels = { level: 'Trazo/nivel', formwork: 'Cimbra/puntal', steel: 'Acero', electrical: 'Eléctrico', plumbing: 'Plomería', cleaning: 'Limpieza', pump: 'Bomba programada' }; return Object.entries(p.checklist || {}).filter(([, v]) => v === 'No' || !v).map(([k, v]) => `${labels[k] || k}: ${v || 'Pendiente'}`) }
function calcPourResult(p) { const values = Object.values(p.checklist || {}); if (values.some((v) => v === 'No')) return 'NO LIBERADO'; if (values.some((v) => !v)) return 'PENDIENTE'; return 'LIBERADO' }
function warehouseFinalQty(w) { const initial = Number(w.initialQty || 0); const qty = Number(w.movementQty || 0); if (['Entrada', 'Devolución'].includes(w.movement)) return initial + qty; if (['Salida', 'Traspaso'].includes(w.movement)) return initial - qty; return initial + qty }

function makeGuidance(title, responsibles, steps, sheetName) { return { title, responsibles: Array.isArray(responsibles) ? responsibles.filter(Boolean) : [responsibles].filter(Boolean), steps: steps.filter(Boolean), sheetName } }
function guidanceToText(g) { const nl = String.fromCharCode(10); return `${g.title}${nl}Responsable(s): ${g.responsibles.join(', ') || 'Por definir'}${nl}Acciones:${nl}- ${g.steps.join(`${nl}- `)}${g.sheetName ? `${nl}Registro en Sheet: ${g.sheetName}` : ''}` }
function restrictionGuidance(r) { return makeGuidance(`Cómo destrabar ${r.house}/${r.stage}`, [r.responsible || 'Responsable técnico', 'Supervisor', 'Residente'], [`Confirmar en campo si la restricción sigue vigente: ${r.title}.`, `Ejecutar la corrección: ${r.impact || 'resolver impacto indicado'}.`, 'Supervisor verifica físicamente.', 'Cambiar estatus a Cerrada con evidencia.'], 'Restricciones_Diario') }
function qualityGuidance(q) { return makeGuidance(`Cómo cerrar calidad ${q.house}/${q.stage}`, [q.responsible || 'Responsable de corrección', 'Supervisor'], [`Ejecutar: ${q.correctiveAction || 'definir acción correctiva'}.`, `Cumplir fecha: ${q.dueDate || 'por definir'}.`, 'Supervisor revisa y valida.', 'Adjuntar evidencia.'], 'Calidad_Diario') }
function pourGuidance(data, p) { const issues = checklistIssues(p); const blockers = blockerReasons(data, p.house); return makeGuidance(`Cómo liberar pre-colado ${p.house}/${p.element}`, ['Residente', 'Supervisor'], [`Corregir checklist: ${issues.length ? issues.join('; ') : 'completo'}.`, blockers.length ? `Cerrar bloqueos: ${blockers.join('; ')}.` : 'Sin restricciones ni calidad abierta.', 'Adjuntar evidencia/foto/link.', 'Supervisor revisa y autoriza solo si LIBERADO.'], 'Liberacion_Colado') }
function stageReleaseGuidance(data, r) { const blockers = blockerReasons(data, r.house, r.currentStage); return makeGuidance(`Cómo liberar etapa ${r.house}/${r.currentStage}`, [r.responsible || 'Responsable de pendiente', 'Supervisor', 'Residente'], [r.pendingAction ? `Cerrar pendiente: ${r.pendingAction}.` : 'Confirmar etapa terminada.', blockers.length ? `Resolver bloqueos: ${blockers.join('; ')}.` : 'Sin restricciones/calidad abierta.', 'Subir evidencia.', 'Supervisor valida y libera.'], 'Liberacion_Etapa') }
function pieceworkGuidance(data, p) { const hasQual = hasOpenQuality(data, p.house); return makeGuidance(`Cómo autorizar destajo ${p.house}/${p.contractor}`, ['Residente', 'Supervisor', 'Administración'], ['Residente confirma medición.', hasQual ? 'Cerrar calidad abierta antes de pagar.' : 'Sin calidad abierta.', 'Supervisor decide: Pagar / Parcial / Retener / No procede.', 'Si Parcial, definir % o monto autorizado.'], 'Destajos_J') }
function materialGuidance(m) { const projected = Number(m.currentStock || 0) - Number(m.consumption1 || 0) - Number(m.consumption2 || 0); return makeGuidance(`Cómo resolver: ${m.material}`, [m.responsible || 'Residente/Supervisor', 'Administración'], [`Validar existencia real: ${m.currentStock || 0} ${m.unit}.`, `Stock proyectado: ${projected} ${m.unit}.`, m.inbound === 'Sí' ? `Confirmar llegada: ${m.inboundDate || 'sin fecha'}.` : 'Levantar pedido.', 'Si afecta frente, crear restricción vinculada.'], 'Materiales_2S_V') }
function dailyCloseGuidance(missing) { return makeGuidance('Cómo completar cierre diario', ['Residente', 'Supervisor'], missing.map((m) => `Completar: ${m.label}.`), 'Control_Diario') }

function flattenForSheet(entity, record) {
  if (entity === 'pourReleases') return { ...record, ...(record.checklist || {}) }
  if (entity === 'attendance') return { ...record, ...(record.days || {}) }
  return record
}

function computeMetrics(data) {
  const cw = Number(data.meta.currentWeek || 1)
  const houseStats = data.houses.map((h) => {
    const plannedStage = plannedStageFor(h, cw)
    const plannedProgress = plannedStage ? Math.min(1, Math.max(0, (cw - h.startWeek + 1) / 8)) : cw > h.startWeek + 7 ? 1 : 0
    const logs = data.dailyLogs.filter((l) => l.house === h.code)
    const releasedLogs = logs.filter((l) => l.status === 'Liberado' || l.supervisorValidated === 'Sí')
    const maxLogStage = releasedLogs.reduce((max, l) => Math.max(max, stageByCode[l.stage]?.weight ?? -1), -1)
    const stageProgress = maxLogStage >= 0 ? (maxLogStage + 1) / 8 : 0
    const releaseProgress = data.stageReleases.filter((r) => r.house === h.code && r.released === 'Sí').reduce((max, r) => Math.max(max, ((stageByCode[r.currentStage]?.weight ?? -1) + 1) / 8), 0)
    const realProgress = Math.max(stageProgress, releaseProgress)
    const variance = realProgress - plannedProgress
    let time = plannedProgress === 0 && realProgress === 0 ? 'No inicia' : 'En tiempo'
    if (plannedProgress > 0 && realProgress === 0) time = 'Sin captura'
    if (variance < -0.01) time = 'Atrasada'
    if (variance > 0.01) time = 'Adelantada'
    const openRestrictions = data.restrictions.filter((r) => r.house === h.code && r.status !== 'Cerrada')
    const qualityOpen = data.qualityLogs.filter((q) => q.house === h.code && q.closure === 'Abierto')
    return { ...h, plannedStage: plannedStage?.code || (cw < h.startWeek ? 'No inicia' : 'REM'), plannedProgress, realProgress, variance, time, openRestrictions, qualityOpen }
  })
  const startedReal = houseStats.filter((h) => h.realProgress > 0).length
  const startedPlan = data.houses.filter((h) => h.startWeek <= cw).length
  const completedReal = houseStats.filter((h) => h.realProgress >= 1).length
  const completedPlan = data.houses.filter((h) => cw >= h.startWeek + 7).length
  const avgReal = houseStats.reduce((a, h) => a + h.realProgress, 0) / Math.max(1, houseStats.length)
  const avgPlan = houseStats.reduce((a, h) => a + h.plannedProgress, 0) / Math.max(1, houseStats.length)
  const openRestrictions = data.restrictions.filter((r) => r.status !== 'Cerrada').length
  const criticalRestrictions = data.restrictions.filter((r) => r.status !== 'Cerrada' && r.affectsProjection).length
  const openQuality = data.qualityLogs.filter((q) => q.closure === 'Abierto').length
  const releasedPours = data.pourReleases.filter((p) => calcPourResult(p) === 'LIBERADO' && p.supervisorAuthorized === 'Sí').length
  const payrollNet = data.attendance.reduce((sum, a) => sum + payrollRow(a).net, 0)
  const pieceworkAuthorized = data.piecework.reduce((sum, p) => sum + pieceworkAmount(p), 0)
  const redMaterials = data.materialForecasts.filter((m) => materialRisk(m) === 'Rojo').length
  let general = 'Verde'
  if (criticalRestrictions > 0 || avgReal - avgPlan < -0.05 || redMaterials > 0 || openQuality > 2) general = 'Rojo'
  else if (openRestrictions > 0 || avgReal < avgPlan || openQuality > 0) general = 'Amarillo'
  return { houseStats, startedReal, startedPlan, completedReal, completedPlan, avgReal, avgPlan, openRestrictions, criticalRestrictions, openQuality, releasedPours, payrollNet, pieceworkAuthorized, redMaterials, general }
}

function permissionsFor(role) {
  return {
    canEditPlan: ['Dirección', 'Admin sistema'].includes(role),
    canValidate: ['Supervisor', 'Dirección', 'Admin sistema'].includes(role),
    canAdmin: ['Admin sistema', 'Dirección'].includes(role),
    canPay: ['Administración', 'Dirección', 'Admin sistema', 'Supervisor'].includes(role),
    canWarehouse: ['Residente', 'Supervisor', 'Dirección', 'Admin sistema'].includes(role),
    canViewMaterials: ['Residente', 'Supervisor', 'Administración', 'Dirección', 'Admin sistema'].includes(role),
    canEditMaterials: ['Residente', 'Supervisor', 'Dirección', 'Admin sistema'].includes(role),
  }
}

function buildTasks(data, role, metrics) {
  const tasks = []
  const cw = `S${data.meta.currentWeek}`
  if (role === 'Residente') {
    tasks.push({ id: 'daily-new', title: 'Capturar avance diario', module: 'daily', type: 'Captura', status: 'Pendiente', detail: 'Registra actividad, cuadrilla, entregable y observaciones.' })
    tasks.push({ id: 'daily-close', title: 'Cerrar mi día', module: 'dailyClose', type: 'Cierre', status: 'Pendiente', detail: 'Valida que avance, asistencia, almacén y mañana estén completos.' })
    tasks.push({ id: 'attendance', title: 'Pasar asistencia', module: 'attendance', type: 'Captura', status: 'Pendiente', detail: 'Asistencia y observación de campo.' })
    tasks.push({ id: 'warehouse', title: 'Movimiento de almacén', module: 'warehouse', type: 'Captura', status: 'Pendiente', detail: 'Entradas/salidas las llena residente o supervisor.' })
    tasks.push({ id: 'restriction-new', title: 'Levantar restricción', module: 'restrictions', type: 'Alerta', status: metrics.openRestrictions ? 'Atención' : 'OK', detail: `${metrics.openRestrictions} restricciones abiertas.` })
    tasks.push({ id: 'lookahead', title: 'Lookahead 3 semanas', module: 'lookahead', type: 'Planeación', status: data.lookahead.some((l) => l.status !== 'Listo') ? 'Pendiente' : 'OK', detail: 'Frentes, materiales y responsables.' })
    tasks.push({ id: 'materials', title: 'Materiales críticos', module: 'materials', type: 'Materiales', status: metrics.redMaterials ? 'Rojo' : 'OK', detail: `${metrics.redMaterials} materiales en rojo.` })
  }
  if (role === 'Supervisor') {
    const pendingDaily = data.dailyLogs.filter((l) => l.supervisorValidated !== 'Sí').length
    const pendingPours = data.pourReleases.filter((p) => calcPourResult(p) !== 'LIBERADO' || p.supervisorAuthorized !== 'Sí').length
    const openQuality = data.qualityLogs.filter((q) => q.closure === 'Abierto').length
    const pendingStage = data.stageReleases.filter((r) => r.released !== 'Sí').length
    const pendingPiecework = data.piecework.filter((p) => p.supervisorAuthorized !== 'Sí').length
    tasks.push({ id: 'critical-inbox', title: 'Bandeja crítica', module: 'criticalInbox', type: 'Prioridad', status: (pendingPours || openQuality || pendingStage) ? 'Rojo' : 'OK', detail: 'Colados, calidad, restricciones, luego pagos y cierre.' })
    tasks.push({ id: 'validate-daily', title: 'Validar control diario', module: 'daily', type: 'Validación', status: pendingDaily ? 'Pendiente' : 'OK', detail: `${pendingDaily} capturas sin validar.` })
    tasks.push({ id: 'quality', title: 'Cerrar calidad abierta', module: 'quality', type: 'Calidad', status: openQuality ? 'Rojo' : 'OK', detail: `${openQuality} incidencias abiertas.` })
    tasks.push({ id: 'pours', title: 'Autorizar pre-colados', module: 'pourRelease', type: 'Autorización', status: pendingPours ? 'Atención' : 'OK', detail: `${pendingPours} pre-colados.` })
    tasks.push({ id: 'stage', title: 'Liberar etapas', module: 'stageRelease', type: 'Autorización', status: pendingStage ? 'Pendiente' : 'OK', detail: `${pendingStage} etapas no liberadas.` })
    tasks.push({ id: 'piecework', title: 'Autorizar destajos', module: 'piecework', type: 'Pago', status: pendingPiecework ? 'Pendiente' : 'OK', detail: `${pendingPiecework} sin autorizar.` })
    tasks.push({ id: 'materials-supervisor', title: 'Materiales críticos', module: 'materials', type: 'Materiales', status: metrics.redMaterials ? 'Rojo' : 'OK', detail: 'Supervisor revisa porque no hay almacenista.' })
    tasks.push({ id: 'weekly', title: 'Cerrar reporte semanal', module: 'weeklyReport', type: 'Cierre', status: 'Pendiente', detail: `Semana ${cw}.` })
  }
  if (role === 'Administración') {
    tasks.push({ id: 'admin-materials', title: 'Materiales críticos', module: 'materials', type: 'Consulta', status: metrics.redMaterials ? 'Rojo' : 'OK', detail: `${metrics.redMaterials} en rojo.` })
    tasks.push({ id: 'admin-payroll', title: 'Nómina semanal', module: 'payroll', type: 'Pago', status: metrics.payrollNet ? 'Pendiente' : 'Sin monto', detail: `Visible: ${money(metrics.payrollNet)}.` })
    tasks.push({ id: 'admin-piecework', title: 'Destajos autorizados', module: 'piecework', type: 'Pago', status: metrics.pieceworkAuthorized ? 'Pendiente' : 'Sin monto', detail: `Autorizado: ${money(metrics.pieceworkAuthorized)}.` })
    tasks.push({ id: 'admin-report', title: 'Reporte semanal', module: 'weeklyReport', type: 'Reporte', status: metrics.general, detail: 'Vista ejecutiva.' })
  }
  if (['Dirección', 'Admin sistema'].includes(role)) {
    tasks.push({ id: 'dir-dashboard', title: 'Salud del proyecto', module: 'dashboard', type: 'Dirección', status: metrics.general, detail: `Real ${pct(metrics.avgReal)} vs plan ${pct(metrics.avgPlan)}.` })
    tasks.push({ id: 'dir-plan', title: 'Plan maestro', module: 'plan', type: 'Planeación', status: 'Editable', detail: 'Ajustar arranques si se requiere.' })
    tasks.push({ id: 'dir-alerts', title: 'Atender rojos', module: 'houses', type: 'Prioridad', status: metrics.general, detail: `${metrics.criticalRestrictions} críticas, ${metrics.redMaterials} materiales rojos.` })
  }
  return tasks
}

function buildIssueChips(data, metrics) {
  const chips = []
  data.restrictions.filter((r) => r.status !== 'Cerrada' && r.affectsProjection).forEach((r) => chips.push({ id: `restriction-${r.id}`, label: `${r.house} · ${r.stage}`, sub: `Restricción: ${r.title}`, module: 'restrictions', tone: 'restriction' }))
  data.qualityLogs.filter((q) => q.closure === 'Abierto').forEach((q) => chips.push({ id: `quality-${q.id}`, label: `${q.house} · ${q.stage}`, sub: `Calidad: ${q.review}`, module: 'quality', tone: 'restriction' }))
  data.pourReleases.filter((p) => calcPourResult(p) !== 'LIBERADO' || p.supervisorAuthorized !== 'Sí').forEach((p) => chips.push({ id: `pour-${p.id}`, label: `${p.house} · ${p.element}`, sub: `Pre-colado: ${calcPourResult(p)}`, module: 'pourRelease', tone: 'construction' }))
  data.stageReleases.filter((s) => s.released !== 'Sí').forEach((s) => chips.push({ id: `stage-${s.id}`, label: `${s.house} · ${s.currentStage}`, sub: `Liberación: ${s.pendingAction || 'pendiente'}`, module: 'stageRelease', tone: 'info' }))
  data.materialForecasts.filter((m) => materialRisk(m) !== 'Verde').forEach((m) => { const projected = Number(m.currentStock || 0) - Number(m.consumption1 || 0) - Number(m.consumption2 || 0); chips.push({ id: `material-${m.id}`, label: m.material, sub: `${materialRisk(m)} · proyectado ${projected} ${m.unit}`, module: 'materials', tone: 'warning' }) })
  data.piecework.filter((p) => p.supervisorAuthorized !== 'Sí').forEach((p) => chips.push({ id: `piecework-${p.id}`, label: `${p.house} · ${p.contractor}`, sub: `Destajo: ${p.concept}`, module: 'piecework', tone: 'warning' }))
  metrics.houseStats.filter((h) => h.time === 'Atrasada').forEach((h) => chips.push({ id: `house-${h.code}`, label: `${h.code} · avance`, sub: `Real ${pct(h.realProgress)} vs plan ${pct(h.plannedProgress)}`, module: 'houseFile', tone: 'info' }))
  return chips
}

function taskIssueChips(task, issueChips) {
  const direct = issueChips.filter((i) => i.module === task.module)
  if (direct.length) return direct.slice(0, 4)
  if (['Rojo', 'Atención', 'Pendiente'].includes(task.status)) return issueChips.slice(0, 3)
  return []
}

function bottleneckText(issueChips) {
  if (!issueChips.length) return 'Sin atorones críticos visibles en este corte.'
  const first = issueChips.slice(0, 3).map((i) => i.label).join(' · ')
  const extra = issueChips.length > 3 ? ` y ${issueChips.length - 3} más` : ''
  return `Atorones: ${first}${extra}.`
}

// ============================================================================
// COMPONENTES UI BASE
// ============================================================================

function StatusPill({ value }) {
  const v = String(value || '').toLowerCase()
  let cls = 'bg-paper text-ink-soft border-line'
  if (['verde', 'cumple', 'cerrada', 'cerrado', 'liberado', 'sí', 'pagar', 'en tiempo', 'listo', 'ok'].some((x) => v.includes(x))) cls = 'bg-release/10 text-release border-release/30'
  if (['amarillo', 'observación', 'en proceso', 'reprogramada', 'parcial', 'pendiente', 'sin captura', 'atención', 'editable', 'sin monto'].some((x) => v.includes(x))) cls = 'bg-warning/10 text-warning border-warning/40'
  if (['rojo', 'no cumple', 'abierta', 'atorado', 'no liberado', 'retener', 'no procede', 'atrasada'].some((x) => v === x || v.includes(x)) || v === 'no') cls = 'bg-restriction/10 text-restriction border-restriction/30'
  return <span className={cn('inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide', cls)}>{value || '—'}</span>
}

function Chip({ label, sub, tone, onClick }) {
  const tones = {
    restriction: 'bg-restriction/8 text-restriction border-restriction/30 hover:bg-restriction/15',
    construction: 'bg-construction/8 text-construction border-construction/30 hover:bg-construction/15',
    warning: 'bg-warning/10 text-warning border-warning/40 hover:bg-warning/20',
    info: 'bg-info/8 text-info border-info/30 hover:bg-info/15',
    release: 'bg-release/8 text-release border-release/30 hover:bg-release/15',
  }
  return (
    <button onClick={onClick} title={sub} className={cn('rounded-sm border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition num', tones[tone] || tones.info)}>
      {label}
    </button>
  )
}

function Button({ children, onClick, variant = 'primary', type = 'button', className = '', disabled = false }) {
  const styles = {
    primary: 'bg-ink text-paper hover:bg-construction border-ink',
    secondary: 'bg-paper text-ink border-ink hover:bg-ink hover:text-paper',
    ghost: 'bg-transparent text-ink-soft border-line hover:bg-paper hover:text-ink',
    danger: 'bg-restriction text-paper border-restriction hover:opacity-90',
    ok: 'bg-release text-paper border-release hover:opacity-90',
    warn: 'bg-warning text-paper border-warning hover:opacity-90',
  }
  return (
    <button disabled={disabled} type={type} onClick={onClick} className={cn('inline-flex items-center justify-center rounded-sm border px-3 py-1.5 text-[13px] font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40', styles[variant], className)}>
      {children}
    </button>
  )
}

function Field({ label, value, onChange, type = 'text', options, className = '', disabled = false }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{label}</span>
      {options ? (
        <select disabled={disabled} className="rounded-sm border border-line bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus:border-ink disabled:bg-paper" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input disabled={disabled} className="rounded-sm border border-line bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus:border-ink disabled:bg-paper" type={type} value={value ?? ''} onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)} />
      )}
    </label>
  )
}

function TextArea({ label, value, onChange, className = '', disabled = false }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{label}</span>
      <textarea disabled={disabled} className="min-h-[64px] rounded-sm border border-line bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus:border-ink disabled:bg-paper" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function Card({ title, value, subtitle, status, children, onClick }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick} className={cn('tech-card p-4 text-left', onClick && 'transition hover:border-ink')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">{title}</p>
          {value !== undefined && <p className="mt-1 font-display text-2xl font-bold text-ink num">{value}</p>}
          {subtitle && <p className="mt-1 text-xs text-ink-soft">{subtitle}</p>}
        </div>
        {status && <StatusPill value={status} />}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </Comp>
  )
}

function Table({ columns, rows, onEdit, rowKey = 'id' }) {
  if (!rows || rows.length === 0) return (
    <div className="tech-card p-6 text-center text-sm text-ink-soft">Sin registros todavía. Cuando residente o supervisor capturen, aparecerán aquí.</div>
  )
  return (
    <div className="tech-card overflow-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-line bg-paper">
          <tr>{columns.map((c) => <th key={c.key} className="whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row[rowKey] ?? i} className="border-t border-line hover:bg-paper">
              {columns.map((c) => <td key={c.key} className="align-top px-3 py-2 text-[13px]">{c.render ? c.render(row, onEdit) : String(row[c.key] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SectionHeader({ title, subtitle, children }) {
  return (
    <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

function Progress({ label, value, muted }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft num">
        <span>{label}</span><span>{pct(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-sm bg-line">
        <div className={cn('h-full', muted ? 'bg-ink-soft' : 'bg-construction')} style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
      </div>
    </div>
  )
}

function ResolutionBox({ guidance, compact = false }) {
  if (!guidance) return null
  return (
    <div className={cn('rounded-sm border border-warning/40 bg-warning/5 text-ink', compact ? 'p-3' : 'p-4')}>
      <p className="text-sm font-bold">{guidance.title}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">Responsable(s)</p>
      <p className="text-sm">{guidance.responsibles.join(', ') || 'Por definir'}</p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">Pasos</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm">
        {guidance.steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      {guidance.sheetName && <p className="mt-2 rounded-sm bg-white px-2 py-1 text-[11px] font-mono">Sheet: {guidance.sheetName}</p>}
    </div>
  )
}

function UserSwitch({ users, currentUserId, onChange }) {
  return (
    <div className="border-b border-line bg-white">
      <div className="mx-auto max-w-[1600px] px-4 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">1 · Quién está usando la app</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {users.map((u) => {
            const active = currentUserId === u.id
            return (
              <button key={u.id} onClick={() => onChange(u.id)} className={cn('min-w-[200px] rounded-sm border-2 p-3 text-left transition', active ? roleAccent[u.role] : 'border-line bg-paper text-ink hover:border-ink')}>
                <p className="font-display text-sm font-bold">{u.name}</p>
                <p className={cn('text-[11px] font-semibold uppercase tracking-wide', active ? 'opacity-80' : 'text-ink-soft')}>{u.role}</p>
                <p className={cn('mt-1.5 line-clamp-2 text-[11px]', active ? 'opacity-75' : 'text-ink-soft')}>{u.note}</p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ModuleRibbon({ modules, active, onChange }) {
  return (
    <div className="mb-4 border-b border-line bg-white">
      <div className="px-1 py-2">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">2 · Módulos disponibles</p>
        <div className="flex gap-1 overflow-x-auto px-1 pb-1">
          {modules.map((m) => (
            <button key={m.key} onClick={() => onChange(m.key)} className={cn('shrink-0 rounded-sm border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition', active === m.key ? 'border-ink bg-ink text-paper' : 'border-line bg-paper text-ink hover:border-ink')}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function App() {
  const [data, setData] = useState(makeEmptyState)
  const [currentUserId, setCurrentUserId] = useState('residente')
  const [active, setActive] = useState('home')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [syncStatus, setSyncStatus] = useState({ message: '', tone: 'info' })
  const fileRef = useRef(null)

  const currentUser = data.users.find((u) => u.id === currentUserId) || data.users[0]
  const role = currentUser.role
  const metrics = useMemo(() => computeMetrics(data), [data])
  const permissions = permissionsFor(role)
  const visibleModules = moduleList.filter((m) => (roleModules[role] || []).includes(m.key))
  const tasks = useMemo(() => buildTasks(data, role, metrics), [data, role, metrics])

  // Cargar data.json desde el archivo público (lo genera el script Python desde el Sheet)
  function loadData(silent = false) {
    if (!silent) setSyncStatus({ message: 'Cargando datos del Sheet…', tone: 'info' })
    const url = `${import.meta.env.BASE_URL}data.json?t=${Date.now()}`
    return fetch(url, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((json) => {
        setData((prev) => ({ ...makeEmptyState(), ...json, users: prev.users, routine: json.routine || prev.routine }))
        setLoading(false)
        setLoadError(null)
        if (!silent) {
          setSyncStatus({ message: `Datos actualizados ✓`, tone: 'release' })
          setTimeout(() => setSyncStatus({ message: '', tone: 'info' }), 2500)
        }
      })
      .catch((err) => {
        console.warn('No se pudo cargar data.json:', err)
        setLoadError(String(err))
        setLoading(false)
        if (!silent) setSyncStatus({ message: `Error al cargar: ${err}`, tone: 'restriction' })
      })
  }

  // Carga inicial al montar
  useEffect(() => { loadData(true) }, [])

  // Auto-refresh silencioso cada 5 minutos
  useEffect(() => {
    const interval = setInterval(() => loadData(true), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  function patch(path, updater) {
    setData((prev) => {
      const next = typeof updater === 'function' ? updater(prev[path]) : updater
      return { ...prev, [path]: next, meta: { ...prev.meta, lastUpdated: new Date().toISOString() } }
    })
  }

  async function saveToSheets(entity, record, silent = false) {
    const map = sheetMap[entity]
    if (!map) return
    const payload = { id: Date.now(), uid: record.uid || makeUid(entity), at: new Date().toISOString(), user: currentUser.name, role, entity, sheetName: map.sheetName, record: flattenForSheet(entity, record) }

    // Encolamos siempre localmente para visibilidad
    setData((prev) => ({ ...prev, sheetQueue: [payload, ...(prev.sheetQueue || [])].slice(0, 50) }))

    // Si Apps Script está configurado, hacemos POST real
    if (APPS_SCRIPT_URL && !APPS_SCRIPT_URL.includes('AKfycb...')) {
      try {
        setSyncStatus({ message: `Guardando en ${map.sheetName}…`, tone: 'info' })
        const res = await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ secret: SHARED_SECRET, action: 'append', entity, payload }),
        })
        const json = await res.json().catch(() => ({}))
        if (json.ok) {
          setSyncStatus({ message: `Guardado en ${map.sheetName} ✓`, tone: 'release' })
          if (!silent) setTimeout(() => setSyncStatus({ message: '', tone: 'info' }), 3000)
        } else {
          setSyncStatus({ message: `Error: ${json.error || 'sin detalle'}`, tone: 'restriction' })
        }
      } catch (err) {
        setSyncStatus({ message: `Sin conexión. Guardado en cola local: ${err.message}`, tone: 'warning' })
      }
    } else {
      if (!silent) setSyncStatus({ message: `Apps Script no configurado. Registro encolado localmente.`, tone: 'warning' })
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `yod-obra-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function importJson(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { try { setData(JSON.parse(String(reader.result))) } catch { alert('JSON inválido.') } }
    reader.readAsText(file)
    event.target.value = ''
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Header con identidad técnica */}
      <header className="sticky top-0 z-40 border-b border-ink bg-paper">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-sm bg-ink text-paper">
              <span className="font-display text-lg font-bold text-construction">Y</span>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-soft">Sistema operativo de obra</p>
              <h1 className="font-display text-lg font-semibold tracking-tight">{data.meta.projectName}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {syncStatus.message && (
              <span className={cn('rounded-sm border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide', syncStatus.tone === 'release' && 'border-release/40 bg-release/10 text-release', syncStatus.tone === 'restriction' && 'border-restriction/40 bg-restriction/10 text-restriction', syncStatus.tone === 'warning' && 'border-warning/40 bg-warning/10 text-warning', syncStatus.tone === 'info' && 'border-line bg-paper text-ink-soft')}>
                {syncStatus.message}
              </span>
            )}
            <span className="hidden text-[11px] font-mono text-ink-soft md:inline">S{data.meta.currentWeek} · {new Date(data.meta.lastUpdated).toLocaleDateString('es-MX')}</span>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importJson} />
            <Button variant="secondary" onClick={() => loadData(false)}>↻ Actualizar</Button>
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>Importar</Button>
            <Button variant="ghost" onClick={exportJson}>Exportar</Button>
          </div>
        </div>
      </header>

      <UserSwitch users={data.users} currentUserId={currentUserId} onChange={(id) => { setCurrentUserId(id); setActive('home') }} />

      <div className="mx-auto max-w-[1600px] px-4 py-4">
        <ModuleRibbon modules={visibleModules} active={active} onChange={setActive} />

        {loading && (
          <div className="tech-card p-8 text-center">
            <p className="font-display text-lg font-semibold">Cargando datos del Sheet…</p>
            <p className="mt-1 text-sm text-ink-soft">Si tarda, revisa que <span className="font-mono">data.json</span> esté en <span className="font-mono">/public</span>.</p>
          </div>
        )}

        {!loading && loadError && (
          <div className="tech-card mb-4 border-warning/40 bg-warning/5 p-4">
            <p className="font-bold text-warning">Modo demo (sin Sheet conectado)</p>
            <p className="mt-1 text-sm text-ink-soft">No se pudo cargar <span className="font-mono">data.json</span>: {loadError}. La app funciona vacía. Cuando el Python sync corra y suba <span className="font-mono">data.json</span>, los datos llegarán solos.</p>
          </div>
        )}

        {!loading && (
          <main className="min-w-0">
            {active === 'home' && <Home user={currentUser} tasks={tasks} setActive={setActive} metrics={metrics} data={data} />}
            {active === 'dashboard' && <Dashboard data={data} metrics={metrics} setActive={setActive} />}
            {active === 'plan' && <Plan data={data} patch={patch} permissions={permissions} />}
            {active === 'houses' && <Houses metrics={metrics} setActive={setActive} />}
            {active === 'houseFile' && <HouseFile data={data} metrics={metrics} setActive={setActive} />}
            {active === 'daily' && <Daily data={data} patch={patch} permissions={permissions} saveToSheets={saveToSheets} />}
            {active === 'dailyClose' && <DailyClose data={data} patch={patch} role={role} saveToSheets={saveToSheets} />}
            {active === 'restrictions' && <Restrictions data={data} patch={patch} saveToSheets={saveToSheets} />}
            {active === 'lookahead' && <Lookahead data={data} patch={patch} saveToSheets={saveToSheets} />}
            {active === 'stageRelease' && <StageRelease data={data} patch={patch} permissions={permissions} saveToSheets={saveToSheets} />}
            {active === 'pourRelease' && <PourRelease data={data} patch={patch} permissions={permissions} saveToSheets={saveToSheets} />}
            {active === 'quality' && <Quality data={data} patch={patch} saveToSheets={saveToSheets} />}
            {active === 'criticalInbox' && <CriticalInbox data={data} setActive={setActive} />}
            {active === 'warehouse' && <Warehouse data={data} patch={patch} permissions={permissions} saveToSheets={saveToSheets} />}
            {active === 'materials' && <Materials data={data} patch={patch} permissions={permissions} saveToSheets={saveToSheets} role={role} />}
            {active === 'attendance' && <Attendance data={data} patch={patch} saveToSheets={saveToSheets} />}
            {active === 'payroll' && <Payroll data={data} />}
            {active === 'piecework' && <Piecework data={data} patch={patch} permissions={permissions} saveToSheets={saveToSheets} />}
            {active === 'productivity' && <Productivity data={data} />}
            {active === 'weeklyReport' && <WeeklyReport data={data} metrics={metrics} role={role} saveToSheets={saveToSheets} />}
            {active === 'crews' && <Crews data={data} patch={patch} />}
            {active === 'catalogs' && <Catalogs data={data} permissions={permissions} />}
            {active === 'routine' && <Routine data={data} role={role} />}
            {active === 'sheetSync' && <SheetSync data={data} />}
          </main>
        )}
      </div>

      <footer className="mt-12 border-t border-line bg-white">
        <div className="mx-auto max-w-[1600px] px-4 py-4 text-[11px] text-ink-soft">
          <p className="font-mono">{PROJECT.name} · interno · datos sincronizados desde Google Sheets</p>
        </div>
      </footer>
    </div>
  )
}

// ============================================================================
// MÓDULOS
// ============================================================================

function Home({ user, tasks, setActive, metrics, data }) {
  const issueChips = buildIssueChips(data, metrics)
  const summary = [
    { title: 'Semáforo', value: metrics.general, status: metrics.general, detail: bottleneckText(issueChips) },
    { title: 'Restricciones', value: metrics.openRestrictions, status: metrics.criticalRestrictions ? 'Rojo' : metrics.openRestrictions ? 'Amarillo' : 'Verde', detail: metrics.criticalRestrictions ? 'Afectan proyección.' : 'Abiertas en total.' },
    { title: 'Materiales rojos', value: metrics.redMaterials, status: metrics.redMaterials ? 'Rojo' : 'Verde', detail: 'Pueden detener frentes.' },
    { title: 'Calidad abierta', value: metrics.openQuality, status: metrics.openQuality ? 'Rojo' : 'Verde', detail: 'Cerrar antes de liberar/pagar.' },
  ]
  return (
    <section>
      <SectionHeader title={`Mi trabajo · ${user.name}`} subtitle="Acciones que te tocan, atorones específicos debajo de cada acción." />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((s) => <Card key={s.title} {...s} />)}
      </div>

      <div className="tech-card mb-4 p-3">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">Acciones principales</p>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {tasks.map((t) => {
            const chips = taskIssueChips(t, issueChips)
            return (
              <div key={t.id} className="rounded-sm border border-line bg-paper p-3 transition hover:border-ink">
                <button onClick={() => setActive(t.module)} className="w-full text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{t.type}</p>
                  <p className="mt-1 font-display text-sm font-semibold leading-tight">{t.title}</p>
                  <p className="mt-1 text-xs text-ink-soft">{t.detail}</p>
                  <div className="mt-2"><StatusPill value={t.status} /></div>
                </button>
                {chips.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-2">
                    {chips.map((chip) => <Chip key={chip.id} label={chip.label} sub={chip.sub} tone={chip.tone} onClick={() => setActive(chip.module)} />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {issueChips.length > 0 && (
        <div className="tech-card p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-restriction">Atorones detectados</p>
          <p className="mb-3 text-sm text-ink">{bottleneckText(issueChips)}</p>
          <div className="flex flex-wrap gap-1">
            {issueChips.slice(0, 16).map((chip) => <Chip key={chip.id} label={chip.label} sub={chip.sub} tone={chip.tone} onClick={() => setActive(chip.module)} />)}
          </div>
        </div>
      )}
    </section>
  )
}

function Dashboard({ data, metrics, setActive }) {
  const cards = [
    { title: 'Semáforo general', value: metrics.general, status: metrics.general, subtitle: `Semana S${data.meta.currentWeek}` },
    { title: 'Avance promedio', value: pct(metrics.avgReal), subtitle: `Plan ${pct(metrics.avgPlan)}` },
    { title: 'Casas iniciadas', value: `${metrics.startedReal}/${metrics.startedPlan}`, subtitle: 'Real vs plan' },
    { title: 'Restricciones abiertas', value: metrics.openRestrictions, status: metrics.criticalRestrictions ? 'Rojo' : metrics.openRestrictions ? 'Amarillo' : 'Verde', subtitle: `${metrics.criticalRestrictions} afectan proyección` },
    { title: 'Calidad abierta', value: metrics.openQuality, status: metrics.openQuality ? 'Rojo' : 'Verde', subtitle: 'Sin cerrar' },
    { title: 'Colados liberados', value: metrics.releasedPours, subtitle: 'Checklist + supervisor' },
    { title: 'Materiales rojos', value: metrics.redMaterials, status: metrics.redMaterials ? 'Rojo' : 'Verde', subtitle: 'Riesgo 2 semanas' },
    { title: 'Destajo autorizado', value: money(metrics.pieceworkAuthorized), subtitle: 'Pagable' },
    { title: 'Nómina neta', value: money(metrics.payrollNet), subtitle: 'Desde asistencia' },
  ]
  return (
    <section>
      <SectionHeader title="Dashboard ejecutivo" subtitle="Lectura rápida para Dirección y Administración." />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{cards.map((c) => <Card key={c.title} {...c} />)}</div>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <div className="tech-card p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">Casas que requieren atención</p>
          <div className="grid gap-1.5">
            {metrics.houseStats.filter((h) => h.time === 'Atrasada' || h.openRestrictions.length || h.qualityOpen.length).slice(0, 8).map((h) => (
              <button key={h.code} onClick={() => setActive('houses')} className="flex items-center justify-between rounded-sm border border-line bg-paper px-3 py-2 text-left text-sm hover:border-ink">
                <span className="font-display font-semibold">{h.code}</span>
                <span className="num text-xs text-ink-soft">Real {pct(h.realProgress)} · Plan {pct(h.plannedProgress)}</span>
                <StatusPill value={h.openRestrictions.length ? 'Restricción' : h.qualityOpen.length ? 'Calidad' : h.time} />
              </button>
            ))}
          </div>
        </div>
        <div className="tech-card p-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">Alertas operativas</p>
          <div className="space-y-2 text-sm">
            <p><span className="num font-bold">{metrics.criticalRestrictions}</span> restricciones afectan proyección.</p>
            <p><span className="num font-bold">{metrics.openQuality}</span> incidencias de calidad abiertas.</p>
            <p><span className="num font-bold">{metrics.redMaterials}</span> materiales en riesgo rojo.</p>
            <p className="rounded-sm border border-warning/40 bg-warning/5 p-2 text-xs text-ink">No colar ni avanzar etapa con restricción abierta crítica, calidad abierta o checklist incompleto.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Plan({ data, patch, permissions }) {
  return (
    <section>
      <SectionHeader title="Plan maestro · Gantt" subtitle="Programa escalonado por casa. Solo Dirección/Admin sistema edita arranques." />
      {!permissions.canEditPlan && <div className="mb-3 rounded-sm border border-warning/40 bg-warning/5 p-3 text-sm">Tu rol no edita el plan. Esto evita que campo mueva el programa por accidente.</div>}
      <div className="tech-card overflow-auto p-2">
        <table className="min-w-[1100px] text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-ink-soft">
              <th className="sticky left-0 z-10 bg-white px-2 py-2">Casa</th>
              <th className="px-2 py-2">Arranque</th>
              {weeks.map((w) => <th key={w} className="px-2 py-2 text-center font-mono">{w}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.houses.map((h) => (
              <tr key={h.code} className="border-t border-line">
                <td className="sticky left-0 z-10 bg-white px-2 py-1.5 font-display font-semibold">{h.code}</td>
                <td className="px-2 py-1.5">
                  <select disabled={!permissions.canEditPlan} value={h.startWeek} onChange={(e) => patch('houses', (arr) => arr.map((x) => x.id === h.id ? { ...x, startWeek: Number(e.target.value) } : x))} className="w-14 rounded-sm border border-line bg-white px-1 py-0.5 text-xs disabled:bg-paper">
                    {weeks.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
                  </select>
                </td>
                {weeks.map((w, i) => {
                  const st = plannedStageFor(h, i + 1)
                  return <td key={w} className="px-1 py-1.5 text-center">{st ? <span className="inline-flex min-w-[34px] justify-center rounded-sm border border-ink/20 bg-paper px-1 py-0.5 text-[10px] font-bold font-mono">{st.code}</span> : <span className="text-line">·</span>}</td>
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Houses({ metrics, setActive }) {
  return (
    <section>
      <SectionHeader title="Avance por casas" subtitle="Estado por casa: real, plan, restricciones y calidad." />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.houseStats.map((h) => (
          <div key={h.code} className="tech-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-semibold">{h.code}</h3>
                <p className="text-xs text-ink-soft">Arranque S{h.startWeek} · Etapa {h.plannedStage}</p>
              </div>
              <StatusPill value={h.openRestrictions.length ? 'Restricción' : h.qualityOpen.length ? 'Calidad' : h.time} />
            </div>
            <div className="mt-3 space-y-2">
              <Progress label="Real" value={h.realProgress} />
              <Progress label="Plan" value={h.plannedProgress} muted />
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              <Button variant="ghost" onClick={() => setActive('houseFile')}>Ficha</Button>
              <Button variant="ghost" onClick={() => setActive('daily')}>Bitácora</Button>
              <Button variant={h.openRestrictions.length ? 'danger' : 'ghost'} onClick={() => setActive('restrictions')}>Restr {h.openRestrictions.length}</Button>
              <Button variant={h.qualityOpen.length ? 'warn' : 'ghost'} onClick={() => setActive('quality')}>Cal {h.qualityOpen.length}</Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function HouseFile({ data, metrics, setActive }) {
  const [house, setHouse] = useState(metrics.houseStats[0]?.code || 'C1')
  const h = metrics.houseStats.find((x) => x.code === house) || metrics.houseStats[0]
  if (!h) return null
  const related = {
    logs: data.dailyLogs.filter((x) => x.house === house),
    restrictions: data.restrictions.filter((x) => x.house === house),
    quality: data.qualityLogs.filter((x) => x.house === house),
  }
  return (
    <section>
      <SectionHeader title={`Ficha · ${house}`} subtitle="Una sola verdad por casa.">
        <Field label="Casa" options={data.houses.map((x) => x.code)} value={house} onChange={setHouse} />
      </SectionHeader>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Card title="Avance real" value={pct(h.realProgress)} status={h.time} subtitle={`Plan ${pct(h.plannedProgress)}`} />
        <Card title="Etapa programada" value={h.plannedStage} subtitle={`Arranque S${h.startWeek}`} />
        <Card title="Restricciones" value={related.restrictions.filter((r) => r.status !== 'Cerrada').length} status={h.openRestrictions.length ? 'Rojo' : 'Verde'} />
        <Card title="Calidad abierta" value={related.quality.filter((q) => q.closure === 'Abierto').length} status={h.qualityOpen.length ? 'Rojo' : 'Verde'} />
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card title="Bloqueos de avance" status={blockerReasons(data, house).length ? 'Rojo' : 'Verde'}>
          {blockerReasons(data, house).length ? (
            <div className="space-y-2">
              {related.restrictions.filter((r) => r.status !== 'Cerrada' && r.affectsProjection).map((r) => <ResolutionBox key={`r-${r.id}`} guidance={restrictionGuidance(r)} compact />)}
              {related.quality.filter((q) => q.closure === 'Abierto').map((q) => <ResolutionBox key={`q-${q.id}`} guidance={qualityGuidance(q)} compact />)}
            </div>
          ) : <p className="text-sm text-release">Sin bloqueos críticos abiertos.</p>}
        </Card>
        <Card title="Acciones rápidas">
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" onClick={() => setActive('daily')}>Nueva bitácora</Button>
            <Button variant="ghost" onClick={() => setActive('restrictions')}>Restricción</Button>
            <Button variant="ghost" onClick={() => setActive('stageRelease')}>Liberar etapa</Button>
            <Button variant="ghost" onClick={() => setActive('pourRelease')}>Pre-colado</Button>
          </div>
        </Card>
      </div>
    </section>
  )
}

function QuickForm({ title, children, onSubmit, button }) {
  return (
    <div className="tech-card mb-4 p-4">
      <h3 className="mb-3 font-display text-base font-semibold">{title}</h3>
      <div className="grid gap-3 md:grid-cols-4">{children}</div>
      <div className="mt-3"><Button onClick={onSubmit}>{button}</Button></div>
    </div>
  )
}

function Daily({ data, patch, permissions, saveToSheets }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ date: today, house: data.houses[0]?.code || 'C1', stage: 'CIM', week: `S${data.meta.currentWeek}`, activity: '', crew: data.catalogs.crews[0] || 'A-1', deliverable: '', status: 'En proceso', start: false, close: false, milestone: 'Seguimiento', residentNotes: '', supervisorValidated: 'No', qualityResult: 'Cumple', correctiveAction: '', tomorrowAction: '' })
  const add = () => {
    if (!form.date || !form.house || !form.stage || !form.activity || !form.deliverable || !form.tomorrowAction) return alert('Faltan: fecha, casa, etapa, actividad, entregable, acción mañana.')
    const rec = { id: nextId(data.dailyLogs), uid: makeUid('dailyLogs'), ...form, week: form.week || autoWeekFromDate(form.date) }
    patch('dailyLogs', (arr) => [rec, ...arr])
    saveToSheets('dailyLogs', rec)
    setForm((f) => ({ ...f, activity: '', deliverable: '', residentNotes: '' }))
  }
  return (
    <section>
      <SectionHeader title="Control diario" subtitle="Residente captura. Supervisor valida. Va a Control_Diario." />
      <QuickForm title="Nueva captura" onSubmit={add} button="Guardar y enviar a Sheet">
        <Field label="Fecha" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        <Field label="Casa" options={data.houses.map((h) => h.code)} value={form.house} onChange={(v) => setForm({ ...form, house: v })} />
        <Field label="Etapa" options={stages.map((s) => s.code)} value={form.stage} onChange={(v) => setForm({ ...form, stage: v })} />
        <Field label="Semana" options={weeks} value={form.week} onChange={(v) => setForm({ ...form, week: v })} />
        <Field label="Cuadrilla" options={data.catalogs.crews} value={form.crew} onChange={(v) => setForm({ ...form, crew: v })} />
        <Field label="Estatus" options={data.catalogs.activityStatus} value={form.status} onChange={(v) => setForm({ ...form, status: v })} />
        <Field label="Hito" options={['Inicio', 'Seguimiento', 'Cierre']} value={form.milestone} onChange={(v) => setForm({ ...form, milestone: v })} />
        <Field label="Validó sup." disabled={!permissions.canValidate} options={['Sí', 'No']} value={form.supervisorValidated} onChange={(v) => setForm({ ...form, supervisorValidated: v })} />
        <TextArea label="Actividad del día" value={form.activity} onChange={(v) => setForm({ ...form, activity: v })} className="md:col-span-2" />
        <TextArea label="Entregable esperado" value={form.deliverable} onChange={(v) => setForm({ ...form, deliverable: v })} className="md:col-span-2" />
        <TextArea label="Observaciones residente" value={form.residentNotes} onChange={(v) => setForm({ ...form, residentNotes: v })} className="md:col-span-2" />
        <TextArea label="Acción mañana" value={form.tomorrowAction} onChange={(v) => setForm({ ...form, tomorrowAction: v })} className="md:col-span-2" />
      </QuickForm>
      <Table columns={[
        { key: 'date', label: 'Fecha' },
        { key: 'house', label: 'Casa' },
        { key: 'stage', label: 'Etapa' },
        { key: 'week', label: 'Sem' },
        { key: 'activity', label: 'Actividad' },
        { key: 'crew', label: 'Cuadrilla' },
        { key: 'status', label: 'Estatus', render: (r) => <StatusPill value={r.status} /> },
        { key: 'supervisorValidated', label: 'Validó', render: (r, edit) => permissions.canValidate ? <select className="rounded-sm border border-line px-2 py-0.5 text-xs" value={r.supervisorValidated} onChange={(e) => edit(r.id, { supervisorValidated: e.target.value })}><option>Sí</option><option>No</option></select> : <StatusPill value={r.supervisorValidated} /> },
      ]} rows={data.dailyLogs} onEdit={(id, p) => patch('dailyLogs', (arr) => updateById(arr, id, p))} />
    </section>
  )
}

function Restrictions({ data, patch, saveToSheets }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ date: today, house: data.houses[0]?.code || 'C1', stage: 'CIM', title: '', impact: '', responsible: '', week: `S${data.meta.currentWeek}`, dueDate: today, status: 'Abierta', closeAction: '', affectsProjection: true })
  const add = () => {
    if (!form.title) return alert('Escribe la restricción.')
    const rec = { id: nextId(data.restrictions), ...form }
    patch('restrictions', (arr) => [rec, ...arr])
    saveToSheets('restrictions', rec)
    setForm((f) => ({ ...f, title: '', impact: '', closeAction: '' }))
  }
  return (
    <section>
      <SectionHeader title="Restricciones" subtitle="Bloqueos por casa, etapa y responsable. Residente levanta, supervisor cierra." />
      <QuickForm title="Nueva restricción" onSubmit={add} button="Guardar y enviar a Sheet">
        <Field label="Fecha" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        <Field label="Casa" options={data.houses.map((h) => h.code)} value={form.house} onChange={(v) => setForm({ ...form, house: v })} />
        <Field label="Etapa" options={stages.map((s) => s.code)} value={form.stage} onChange={(v) => setForm({ ...form, stage: v })} />
        <Field label="Semana" options={weeks} value={form.week} onChange={(v) => setForm({ ...form, week: v })} />
        <Field label="Responsable" value={form.responsible} onChange={(v) => setForm({ ...form, responsible: v })} />
        <Field label="Compromiso" type="date" value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} />
        <Field label="Estatus" options={data.catalogs.restrictionStatus} value={form.status} onChange={(v) => setForm({ ...form, status: v })} />
        <label className="flex items-end gap-2 pb-1.5 text-xs font-semibold">
          <input type="checkbox" checked={form.affectsProjection} onChange={(e) => setForm({ ...form, affectsProjection: e.target.checked })} /> Afecta proyección
        </label>
        <TextArea label="Restricción" value={form.title} onChange={(v) => setForm({ ...form, title: v })} className="md:col-span-2" />
        <TextArea label="Impacto" value={form.impact} onChange={(v) => setForm({ ...form, impact: v })} className="md:col-span-2" />
      </QuickForm>
      <Table columns={[
        { key: 'id', label: '#' },
        { key: 'house', label: 'Casa' },
        { key: 'stage', label: 'Etapa' },
        { key: 'title', label: 'Restricción' },
        { key: 'responsible', label: 'Responsable' },
        { key: 'dueDate', label: 'Compromiso' },
        { key: 'status', label: 'Estatus', render: (r, edit) => <select className="rounded-sm border border-line px-2 py-0.5 text-xs" value={r.status} onChange={(e) => edit(r.id, { status: e.target.value })}>{data.catalogs.restrictionStatus.map((s) => <option key={s}>{s}</option>)}</select> },
        { key: 'affectsProjection', label: 'Afecta', render: (r) => <StatusPill value={r.affectsProjection ? 'Sí' : 'No'} /> },
      ]} rows={data.restrictions} onEdit={(id, p) => patch('restrictions', (arr) => updateById(arr, id, p))} />
    </section>
  )
}

function Lookahead({ data, patch }) {
  return (
    <SimpleEditableModule
      title="Lookahead 3 semanas"
      subtitle="Preparar frentes antes de que llegue la cuadrilla."
      rows={data.lookahead}
      cols={[
        { key: 'targetWeek', label: 'Sem' }, { key: 'house', label: 'Casa' }, { key: 'stage', label: 'Etapa' },
        { key: 'activity', label: 'Actividad' }, { key: 'prerequisites', label: 'Necesita' }, { key: 'resources', label: 'Material' },
        { key: 'crew', label: 'Cuadrilla' }, { key: 'responsible', label: 'Responsable' }, { key: 'dueDate', label: 'Límite' },
        { key: 'status', label: 'Estatus', render: (r, edit) => <select className="rounded-sm border border-line px-2 py-0.5 text-xs" value={r.status} onChange={(e) => edit(r.id, { status: e.target.value })}><option>Pendiente</option><option>En proceso</option><option>Listo</option><option>Atorado</option></select> },
        { key: 'ready', label: 'Lista', render: (r, edit) => <select className="rounded-sm border border-line px-2 py-0.5 text-xs" value={r.ready} onChange={(e) => edit(r.id, { ready: e.target.value })}><option>Sí</option><option>No</option></select> },
      ]}
      onEdit={(id, p) => patch('lookahead', (arr) => updateById(arr, id, p))}
    />
  )
}

function StageRelease({ data, patch, permissions }) {
  return (
    <SimpleEditableModule
      title="Liberación de etapa"
      subtitle="Si hay restricción/calidad abierta, no libera."
      rows={data.stageReleases}
      cols={[
        { key: 'date', label: 'Fecha' }, { key: 'week', label: 'Sem' }, { key: 'house', label: 'Casa' },
        { key: 'currentStage', label: 'Actual' }, { key: 'pendingAction', label: 'Pendiente' },
        { key: 'responsible', label: 'Responsable' }, { key: 'nextStage', label: 'Siguiente' },
        { key: 'released', label: 'Liberada', render: (r, edit) => permissions.canValidate ? (
          <select className="rounded-sm border border-line px-2 py-0.5 text-xs" value={r.released} onChange={(e) => {
            const val = e.target.value
            if (val === 'Sí') {
              const reasons = blockerReasons(data, r.house, r.currentStage)
              if (reasons.length) return alert(guidanceToText(stageReleaseGuidance(data, r)))
              if (!r.evidence) return alert('Falta evidencia/foto/link.')
            }
            edit(r.id, { released: val })
          }}><option>Sí</option><option>No</option></select>
        ) : <StatusPill value={r.released} /> },
        { key: 'evidence', label: 'Evidencia' },
      ]}
      onEdit={(id, p) => patch('stageReleases', (arr) => updateById(arr, id, p))}
    />
  )
}

function PourRelease({ data, patch, permissions }) {
  return (
    <section>
      <SectionHeader title="Liberación pre-colado" subtitle="Bloquea autorización con NO, pendiente, restricción o calidad abierta." />
      <Table columns={[
        { key: 'date', label: 'Fecha' }, { key: 'house', label: 'Casa' }, { key: 'element', label: 'Elemento' },
        { key: 'quantity', label: 'Vol' },
        { key: 'checklist', label: 'Checklist', render: (r) => <div className="flex flex-wrap gap-0.5">{Object.entries(r.checklist || {}).map(([k, v]) => <span key={k} className="rounded-sm border border-line bg-paper px-1 py-0.5 text-[10px] font-mono">{k}:{v}</span>)}</div> },
        { key: 'result', label: 'Resultado', render: (r) => <StatusPill value={calcPourResult(r)} /> },
        { key: 'blockers', label: 'Bloqueos', render: (r) => { const reasons = blockerReasons(data, r.house); return reasons.length ? <StatusPill value={`${reasons.length} bloqueo`} /> : <StatusPill value="Libre" /> } },
        { key: 'supervisorAuthorized', label: 'Autoriza', render: (r, edit) => permissions.canValidate ? (
          <select className="rounded-sm border border-line px-2 py-0.5 text-xs" value={r.supervisorAuthorized} onChange={(e) => {
            const val = e.target.value
            if (val === 'Sí') {
              const result = calcPourResult(r)
              const reasons = blockerReasons(data, r.house)
              if (result !== 'LIBERADO' || reasons.length || !r.evidence) return alert(guidanceToText(pourGuidance(data, r)))
            }
            edit(r.id, { supervisorAuthorized: val })
          }}><option>Sí</option><option>No</option></select>
        ) : <StatusPill value={r.supervisorAuthorized} /> },
        { key: 'evidence', label: 'Evidencia' },
      ]} rows={data.pourReleases} onEdit={(id, p) => patch('pourReleases', (arr) => updateById(arr, id, p))} />
    </section>
  )
}

function Quality({ data, patch }) {
  return (
    <SimpleEditableModule
      title="Calidad diaria"
      subtitle="No Cumple exige acción, responsable y fecha."
      rows={data.qualityLogs}
      cols={[
        { key: 'date', label: 'Fecha' }, { key: 'house', label: 'Casa' }, { key: 'stage', label: 'Etapa' },
        { key: 'review', label: 'Revisión' },
        { key: 'result', label: 'Resultado', render: (r) => <StatusPill value={r.result} /> },
        { key: 'correctiveAction', label: 'Corrección' }, { key: 'responsible', label: 'Responsable' },
        { key: 'dueDate', label: 'Compromiso' },
        { key: 'closure', label: 'Cierre', render: (r, edit) => <select className="rounded-sm border border-line px-2 py-0.5 text-xs" value={r.closure} onChange={(e) => {
          const val = e.target.value
          if (val === 'Cerrado' && (!r.correctiveAction || !r.responsible || !r.dueDate)) return alert(guidanceToText(qualityGuidance(r)))
          edit(r.id, { closure: val })
        }}><option>Abierto</option><option>Cerrado</option></select> },
      ]}
      onEdit={(id, p) => patch('qualityLogs', (arr) => updateById(arr, id, p))}
    />
  )
}

function Warehouse({ data, patch, permissions }) {
  return (
    <section>
      <SectionHeader title="Almacén diario" subtitle="Lo llenan residente o supervisor. Administración solo consulta." />
      {!permissions.canWarehouse && <div className="mb-3 rounded-sm border border-warning/40 bg-warning/5 p-3 text-sm">Tu rol consulta, no captura movimientos.</div>}
      <Table columns={[
        { key: 'date', label: 'Fecha' }, { key: 'material', label: 'Material' }, { key: 'unit', label: 'Unidad' },
        { key: 'movement', label: 'Movimiento' }, { key: 'initialQty', label: 'Inicial' }, { key: 'movementQty', label: 'Mov' },
        { key: 'final', label: 'Final', render: (r) => <span className="num">{warehouseFinalQty(r).toLocaleString('es-MX')}</span> },
        { key: 'supplier', label: 'Proveedor' }, { key: 'house', label: 'Casa' }, { key: 'crew', label: 'Cuadrilla' },
      ]} rows={data.warehouse} onEdit={(id, p) => permissions.canWarehouse && patch('warehouse', (arr) => updateById(arr, id, p))} />
    </section>
  )
}

function Materials({ data, patch, permissions, role }) {
  return (
    <section>
      <SectionHeader title="Materiales críticos · 2 semanas" subtitle="Estimado vs real lado a lado. Administración consulta; campo captura." />
      {role === 'Administración' && <div className="mb-3 rounded-sm border border-info/40 bg-info/5 p-3 text-sm">Administración ve materiales para anticipar compras/pagos. La captura operativa la hacen residente/supervisor.</div>}
      <Table columns={[
        { key: 'week', label: 'Sem' }, { key: 'material', label: 'Material' }, { key: 'unit', label: 'Unidad' },
        { key: 'currentStock', label: 'Existencia' }, { key: 'consumption1', label: '+1S' }, { key: 'consumption2', label: '+2S' },
        { key: 'projected', label: 'Proyectado', render: (r) => <span className="num">{(Number(r.currentStock) - Number(r.consumption1) - Number(r.consumption2)).toLocaleString('es-MX')}</span> },
        { key: 'inbound', label: 'Pedido', render: (r, edit) => permissions.canEditMaterials ? <select className="rounded-sm border border-line px-2 py-0.5 text-xs" value={r.inbound} onChange={(e) => edit(r.id, { inbound: e.target.value })}><option>Sí</option><option>No</option></select> : <StatusPill value={r.inbound} /> },
        { key: 'inboundDate', label: 'Llegada' },
        { key: 'risk', label: 'Riesgo', render: (r) => <StatusPill value={materialRisk(r)} /> },
      ]} rows={data.materialForecasts} onEdit={(id, p) => permissions.canEditMaterials && patch('materialForecasts', (arr) => updateById(arr, id, p))} />
    </section>
  )
}

function Attendance({ data, patch }) {
  return (
    <section>
      <SectionHeader title="Asistencia diaria" subtitle="Residente captura; supervisor valida; administración revisa." />
      <Table columns={[
        { key: 'week', label: 'Sem' }, { key: 'name', label: 'Nombre' }, { key: 'specialty', label: 'Especialidad' },
        { key: 'crew', label: 'Cuadrilla' }, { key: 'wage', label: 'Salario', render: (r) => <span className="num">{money(r.wage)}</span> },
        { key: 'days', label: 'Días', render: (r) => <div className="flex flex-wrap gap-0.5">{Object.entries(r.days || {}).map(([d, v]) => <span key={d} className="rounded-sm bg-paper px-1 py-0.5 text-[10px] font-mono">{d}:{v}</span>)}</div> },
        { key: 'paidDays', label: 'Pag', render: (r) => <span className="num">{payrollRow(r).paidDays}</span> },
        { key: 'net', label: 'Neto', render: (r) => <span className="num">{money(payrollRow(r).net)}</span> },
        { key: 'supervisorValidated', label: 'Validó', render: (r, edit) => <select className="rounded-sm border border-line px-2 py-0.5 text-xs" value={r.supervisorValidated} onChange={(e) => edit(r.id, { supervisorValidated: e.target.value })}><option>Sí</option><option>No</option></select> },
      ]} rows={data.attendance} onEdit={(id, p) => patch('attendance', (arr) => updateById(arr, id, p))} />
    </section>
  )
}

function Payroll({ data }) {
  const rows = weeks.map((w) => {
    const list = data.attendance.filter((a) => a.week === w)
    const paidDays = list.reduce((s, a) => s + payrollRow(a).paidDays, 0)
    const base = list.reduce((s, a) => s + payrollRow(a).base, 0)
    const extras = list.reduce((s, a) => s + Number(a.extra || 0), 0)
    const bonus = list.reduce((s, a) => s + Number(a.bonus || 0), 0)
    const discount = list.reduce((s, a) => s + Number(a.discount || 0), 0)
    const net = list.reduce((s, a) => s + payrollRow(a).net, 0)
    return { week: w, people: list.length, paidDays, base, extras, bonus, discount, net }
  })
  return (
    <SimpleReadModule title="Nómina semanal" subtitle="Resumen automático desde asistencia." rows={rows} cols={[
      { key: 'week', label: 'Sem' }, { key: 'people', label: 'Personas' }, { key: 'paidDays', label: 'Días', render: (r) => <span className="num">{r.paidDays}</span> },
      { key: 'base', label: 'Base', render: (r) => <span className="num">{money(r.base)}</span> },
      { key: 'extras', label: 'Extras', render: (r) => <span className="num">{money(r.extras)}</span> },
      { key: 'bonus', label: 'Bonos', render: (r) => <span className="num">{money(r.bonus)}</span> },
      { key: 'discount', label: 'Desc', render: (r) => <span className="num">{money(r.discount)}</span> },
      { key: 'net', label: 'Neto', render: (r) => <span className="num font-semibold">{money(r.net)}</span> },
    ]} />
  )
}

function Piecework({ data, patch, permissions }) {
  return (
    <SimpleEditableModule
      title="Destajos"
      subtitle="Residente mide; supervisor/admin autorizan. Avisa si hay calidad abierta."
      rows={data.piecework}
      cols={[
        { key: 'date', label: 'Fecha' }, { key: 'house', label: 'Casa' }, { key: 'contractor', label: 'Contratista' },
        { key: 'concept', label: 'Concepto' }, { key: 'unit', label: 'U' }, { key: 'quantity', label: 'Cant', render: (r) => <span className="num">{r.quantity}</span> },
        { key: 'unitPrice', label: 'PU', render: (r) => <span className="num">{money(r.unitPrice)}</span> },
        { key: 'amount', label: 'Importe', render: (r) => <span className="num">{money(Number(r.quantity) * Number(r.unitPrice))}</span> },
        { key: 'quality', label: 'Cal', render: (r) => hasOpenQuality(data, r.house) ? <StatusPill value="Cal abierta" /> : <StatusPill value="OK" /> },
        { key: 'paymentDecision', label: 'Decisión', render: (r, edit) => permissions.canPay ? <select className="rounded-sm border border-line px-2 py-0.5 text-xs" value={r.paymentDecision} onChange={(e) => {
          const val = e.target.value
          if (['Pagar', 'Pagar Parcial'].includes(val) && hasOpenQuality(data, r.house)) return alert(guidanceToText(pieceworkGuidance(data, r)))
          edit(r.id, { paymentDecision: val })
        }}>{data.catalogs.paymentDecision.map((d) => <option key={d}>{d}</option>)}</select> : <StatusPill value={r.paymentDecision} /> },
        { key: 'authorizedPercent', label: '%' },
        { key: 'authorized', label: 'Autorizado', render: (r) => <span className="num">{money(pieceworkAmount(r))}</span> },
      ]}
      onEdit={(id, p) => patch('piecework', (arr) => updateById(arr, id, p))}
    />
  )
}

function Productivity({ data }) {
  const rows = weeks.flatMap((w) => data.catalogs.crews.slice(0, 8).map((crew) => {
    const interventions = data.dailyLogs.filter((l) => l.week === w && String(l.crew).includes(crew)).length
    const released = data.dailyLogs.filter((l) => l.week === w && l.status === 'Liberado' && String(l.crew).includes(crew)).length
    const paidDays = data.attendance.filter((a) => a.week === w && a.crew === crew).reduce((s, a) => s + payrollRow(a).paidDays, 0)
    const authorized = data.piecework.filter((p) => p.week === w && p.contractor === crew).reduce((s, p) => s + pieceworkAmount(p), 0)
    const target = 2
    return { id: `${w}-${crew}`, week: w, crew, interventions, released, paidDays, authorized, target, compliance: target ? released / target : 0 }
  }))
  return (
    <SimpleReadModule title="Productividad" subtitle="Cruza control diario, liberaciones, asistencia y destajos." rows={rows} cols={[
      { key: 'week', label: 'Sem' }, { key: 'crew', label: 'Cuad' },
      { key: 'interventions', label: 'Int', render: (r) => <span className="num">{r.interventions}</span> },
      { key: 'released', label: 'Lib', render: (r) => <span className="num">{r.released}</span> },
      { key: 'paidDays', label: 'Días', render: (r) => <span className="num">{r.paidDays}</span> },
      { key: 'authorized', label: 'Destajo', render: (r) => <span className="num">{money(r.authorized)}</span> },
      { key: 'compliance', label: 'Cumpl', render: (r) => <StatusPill value={pct(r.compliance)} /> },
    ]} />
  )
}

function WeeklyReport({ data, metrics, role, saveToSheets }) {
  const [supervisorComment, setSupervisorComment] = useState('Revisar restricciones críticas y materiales rojos antes de abrir nuevos frentes.')
  const [correctionPlan, setCorrectionPlan] = useState('1. Cerrar restricciones que afectan proyección.\n2. Confirmar materiales para S+1 y S+2.\n3. No autorizar colados sin checklist completo.')
  const row = {
    week: `S${data.meta.currentWeek}`, startsPlan: metrics.startedPlan, startsReal: metrics.startedReal,
    released: data.dailyLogs.filter((l) => l.status === 'Liberado').length,
    openRestrictions: metrics.openRestrictions, criticalRestrictions: metrics.criticalRestrictions,
    releasedPours: metrics.releasedPours, piecework: metrics.pieceworkAuthorized, payroll: metrics.payrollNet,
    startCompliance: metrics.startedPlan ? metrics.startedReal / metrics.startedPlan : 1,
    closurePlan: metrics.completedPlan, closureReal: metrics.completedReal,
    closureCompliance: metrics.completedPlan ? metrics.completedReal / metrics.completedPlan : 1,
    supervisorComment, correctionPlan,
  }
  const canClose = role !== 'Administración' && supervisorComment.trim() && correctionPlan.trim()
  return (
    <section>
      <SectionHeader title="Reporte semanal" subtitle="Supervisor cierra; Dirección y Administración leen. Va a Reporte_Semanal_S.">
        <Button variant={canClose ? 'ok' : 'warn'} onClick={() => { if (!canClose) return alert('Falta comentario o plan de corrección.'); saveToSheets('weeklyReport', row) }}>Cerrar semana y enviar</Button>
      </SectionHeader>
      <div className="grid gap-3 xl:grid-cols-2">
        <Card title={`Resumen ${row.week}`} value={row.week} status={metrics.general}>
          <div className="mt-3 grid gap-1 text-sm">
            <Line label="Arranques" value={`${row.startsReal}/${row.startsPlan} · ${pct(row.startCompliance)}`} />
            <Line label="Cierres" value={`${row.closureReal}/${row.closurePlan} · ${pct(row.closureCompliance)}`} />
            <Line label="Liberadas" value={row.released} />
            <Line label="Restricciones" value={`${row.openRestrictions} (${row.criticalRestrictions} críticas)`} />
            <Line label="Colados" value={row.releasedPours} />
            <Line label="Destajo" value={money(row.piecework)} />
            <Line label="Nómina" value={money(row.payroll)} />
          </div>
        </Card>
        <div className="tech-card p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-soft">Comentario · Plan de corrección</p>
          <div className="space-y-3">
            <TextArea disabled={role === 'Administración'} label="Comentario supervisor" value={supervisorComment} onChange={setSupervisorComment} />
            <TextArea disabled={role === 'Administración'} label="Plan de corrección" value={correctionPlan} onChange={setCorrectionPlan} />
          </div>
        </div>
      </div>
    </section>
  )
}

function Line({ label, value }) {
  return <div className="flex justify-between gap-3 rounded-sm bg-paper px-2 py-1.5"><span className="text-ink-soft">{label}</span><span className="num font-semibold">{value}</span></div>
}

function Crews({ data, patch }) {
  return (
    <SimpleEditableModule title="Cuadrillas y recursos" subtitle="Plan semanal de frentes y personal." rows={data.crewsPlan} rowKey="week" cols={[
      { key: 'week', label: 'Sem' }, { key: 'startsPlan', label: 'Arranques' },
      { key: 'alba', label: 'Alba' }, { key: 'block', label: 'Block' }, { key: 'losa', label: 'Losa' }, { key: 'ep', label: 'E+P' },
      { key: 'closuresPlan', label: 'Cierres' }, { key: 'notes', label: 'Obs' },
    ]} onEdit={(week, p) => patch('crewsPlan', (arr) => arr.map((x) => x.week === week ? { ...x, ...p } : x))} />
  )
}

function Catalogs({ data }) {
  return (
    <section>
      <SectionHeader title="Catálogos" subtitle="Listas maestras del Sheet · hoja Catalogos." />
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(data.catalogs).map(([key, values]) => (
          <Card key={key} title={key} value={Array.isArray(values) ? values.length : '—'} subtitle="valores">
            {Array.isArray(values) && (
              <div className="mt-2 flex flex-wrap gap-1">
                {values.map((v) => <span key={v} className="rounded-sm border border-line bg-paper px-1.5 py-0.5 text-[11px] font-mono">{v}</span>)}
              </div>
            )}
          </Card>
        ))}
      </div>
    </section>
  )
}

function Routine({ data, role }) {
  const selected = data.routine[role] ? role : 'Residente'
  return <SimpleReadModule title={`Rutina · ${selected}`} subtitle="Checklist operativo por día." rows={data.routine[selected] || []} cols={[
    { key: 'day', label: 'Día' }, { key: 'task', label: 'Controles' }, { key: 'minutes', label: 'Min', render: (r) => <span className="num">{r.minutes}</span> }, { key: 'objective', label: 'Objetivo' },
  ]} />
}

function DailyClose({ data, patch, role, saveToSheets }) {
  const currentWeek = `S${data.meta.currentWeek}`
  const weekLogs = data.dailyLogs.filter((l) => l.week === currentWeek)
  const activeHouses = [...new Set(weekLogs.map((l) => l.house))]
  const checks = [
    { key: 'daily', label: 'Control diario capturado', ok: weekLogs.length > 0 },
    { key: 'tomorrow', label: 'Acción mañana definida', ok: weekLogs.some((l) => l.tomorrowAction) },
    { key: 'attendance', label: 'Asistencia capturada', ok: data.attendance.some((a) => a.week === currentWeek) },
    { key: 'warehouse', label: 'Almacén revisado', ok: data.warehouse.some((w) => w.week === currentWeek) },
    { key: 'materials', label: 'Materiales críticos', ok: data.materialForecasts.some((m) => m.week === currentWeek) },
  ]
  const missing = checks.filter((c) => !c.ok)
  const closeDay = () => {
    if (missing.length) return alert(guidanceToText(dailyCloseGuidance(missing)))
    const records = activeHouses.map((house, idx) => {
      const last = [...weekLogs].reverse().find((l) => l.house === house) || weekLogs[0]
      return {
        id: nextId(data.dailyLogs) + idx, uid: makeUid('dailyLogs'),
        date: new Date().toISOString().slice(0, 10), house, stage: last.stage || 'REM', week: currentWeek,
        activity: `Cierre diario ${currentWeek} / ${house}`, crew: last.crew || 'Residente/Supervisor',
        deliverable: 'Día cerrado', status: 'Liberado', milestone: 'Cierre',
        residentNotes: 'Cierre diario generado.', supervisorValidated: role === 'Supervisor' ? 'Sí' : 'No',
        qualityResult: 'Cumple', tomorrowAction: 'Revisar pendientes críticos',
      }
    })
    patch('dailyLogs', (arr) => [...records, ...arr])
    records.forEach((r) => saveToSheets('dailyLogs', r, true))
    alert(`Cierre generado para ${records.length} casa(s).`)
  }
  return (
    <section>
      <SectionHeader title="Cierre diario" subtitle="Capturas mínimas antes de cerrar el día.">
        <Button variant={missing.length ? 'warn' : 'ok'} onClick={closeDay}>Cerrar día y enviar a Sheet</Button>
      </SectionHeader>
      <div className="mb-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {checks.map((c) => <Card key={c.key} title={c.label} status={c.ok ? 'OK' : 'Pendiente'} subtitle={c.ok ? 'Completo' : 'Falta captura'} />)}
      </div>
      <Card title="Casas activas" value={activeHouses.length} subtitle={activeHouses.join(', ') || 'Sin casas activas'} />
    </section>
  )
}

function CriticalInbox({ data, setActive }) {
  const rows = [
    ...data.pourReleases.filter((p) => calcPourResult(p) !== 'LIBERADO' || p.supervisorAuthorized !== 'Sí').map((p) => ({ id: `pour-${p.id}`, type: 'Pre-colado', priority: calcPourResult(p) === 'NO LIBERADO' ? 'Rojo' : 'Amarillo', house: p.house, ref: p.element, reason: calcPourResult(p), module: 'pourRelease', guidance: pourGuidance(data, p) })),
    ...data.qualityLogs.filter((q) => q.closure === 'Abierto').map((q) => ({ id: `quality-${q.id}`, type: 'Calidad', priority: 'Rojo', house: q.house, ref: q.stage, reason: q.review, module: 'quality', guidance: qualityGuidance(q) })),
    ...data.restrictions.filter((r) => r.status !== 'Cerrada' && r.affectsProjection).map((r) => ({ id: `r-${r.id}`, type: 'Restricción', priority: 'Rojo', house: r.house, ref: r.stage, reason: r.title, module: 'restrictions', guidance: restrictionGuidance(r) })),
    ...data.stageReleases.filter((s) => s.released !== 'Sí').map((s) => ({ id: `s-${s.id}`, type: 'Etapa', priority: 'Amarillo', house: s.house, ref: s.currentStage, reason: s.pendingAction, module: 'stageRelease', guidance: stageReleaseGuidance(data, s) })),
    ...data.piecework.filter((p) => p.supervisorAuthorized !== 'Sí').map((p) => ({ id: `pw-${p.id}`, type: 'Destajo', priority: 'Amarillo', house: p.house, ref: p.contractor, reason: p.concept, module: 'piecework', guidance: pieceworkGuidance(data, p) })),
  ]
  return (
    <section>
      <SectionHeader title="Bandeja crítica del supervisor" subtitle="Orden: NO COLAR · calidad · restricciones · liberaciones · pagos." />
      {rows.length === 0 ? (
        <Card title="Sin pendientes críticos" status="Verde" subtitle="La obra no tiene bloqueos visibles." />
      ) : (
        <Table columns={[
          { key: 'priority', label: 'Pri', render: (r) => <StatusPill value={r.priority} /> },
          { key: 'type', label: 'Tipo' }, { key: 'house', label: 'Casa' }, { key: 'ref', label: 'Ref' }, { key: 'reason', label: 'Motivo' },
          { key: 'guide', label: 'Cómo destrabar', render: (r) => <ResolutionBox guidance={r.guidance} compact /> },
          { key: 'action', label: '', render: (r) => <Button variant={r.priority === 'Rojo' ? 'danger' : 'warn'} onClick={() => setActive(r.module)}>Resolver</Button> },
        ]} rows={rows} />
      )}
    </section>
  )
}

function SheetSync({ data }) {
  return (
    <section>
      <SectionHeader title="Sincronización con Google Sheets" subtitle="Lectura: Python sync cada 10 min. Escritura: Apps Script con shared secret." />
      <div className="mb-3 grid gap-3 xl:grid-cols-2">
        <Card title="Hojas mapeadas" value={Object.keys(sheetMap).length} subtitle="entidades">
          <div className="mt-3 space-y-1 text-sm">
            {Object.entries(sheetMap).map(([key, m]) => (
              <div key={key} className="rounded-sm border border-line bg-paper p-2">
                <p className="font-display font-semibold">{m.label}</p>
                <p className="font-mono text-[11px] text-ink-soft">{m.sheetName}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Estado de la conexión" status={APPS_SCRIPT_URL ? 'OK' : 'Pendiente'}>
          <div className="space-y-2 text-sm">
            <p>Apps Script URL: <span className="font-mono text-xs">{APPS_SCRIPT_URL || '— no configurado —'}</span></p>
            <p>Lectura: <span className="font-mono">data.json</span> generado por sync_sheet.py</p>
            <p>Escritura: POST al Apps Script con SHARED_SECRET</p>
            {!APPS_SCRIPT_URL && <p className="rounded-sm border border-warning/40 bg-warning/5 p-2 text-xs">Mientras Apps Script no esté configurado, las capturas se quedan en cola local.</p>}
          </div>
        </Card>
      </div>
      <SectionHeader title="Cola local de capturas" />
      <Table columns={[
        { key: 'at', label: 'Fecha', render: (r) => new Date(r.at).toLocaleString('es-MX') },
        { key: 'user', label: 'Usuario' }, { key: 'role', label: 'Rol' }, { key: 'sheetName', label: 'Hoja' }, { key: 'entity', label: 'Entidad' },
      ]} rows={data.sheetQueue || []} />
    </section>
  )
}

function SimpleEditableModule({ title, subtitle, rows, cols, onEdit, rowKey = 'id' }) {
  return <section><SectionHeader title={title} subtitle={subtitle} /><Table columns={cols} rows={rows} onEdit={onEdit} rowKey={rowKey} /></section>
}
function SimpleReadModule({ title, subtitle, rows, cols }) {
  return <section><SectionHeader title={title} subtitle={subtitle} /><Table columns={cols} rows={rows} onEdit={() => {}} rowKey="id" /></section>
}
