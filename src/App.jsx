import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Megaphone, Home, Compass, Building2, Users, Folder,
  ChevronDown, ChevronRight, ChevronLeft, Plus, Link2, X, RefreshCw,
  AlertCircle, CheckCircle2, Clock, Zap, Settings, Eye, EyeOff,
  Play, Archive, Calendar, TrendingDown, LayoutGrid, List, GitBranch
} from "lucide-react";

// ===================================================================
// CONFIGURACION — si cambia la URL del Apps Script, actualiza esta linea:
// ===================================================================
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxrc0lFolxwJQUF7wtPHNymf7AwNtsjVs08ivOl18veuqo-jkv4AkpwjZsGDX60ETph/exec";
const SHARED_SECRET = "aurum-2026-x9k7m4q2-secreto";

const ASSETS = {
  logos: {
    "Aurum Arquitectos": "https://lh3.googleusercontent.com/d/1Yqwx2HNO1xveThRfGGTgQqLwQ7Rhurc5=w400",
    "YoDesarrollo": "https://lh3.googleusercontent.com/d/1MusXx_SQyLmTAt5fg6oMg0GaRSkDFrck=w400",
  },
  fotos: {}
};

const DEBOUNCE_MS = 1500;
const PROTECTION_MS = 60 * 1000;
const REFRESH_MS = 5 * 60 * 1000;
const SAVED_FLASH_MS = 1800;
const CACHE_KEY = "aurum-cache-v4";

const SHEET_FIELDS = ["mes", "empresa", "proyecto", "responsable", "semana", "actividad", "entregable", "fecha", "estado", "observaciones", "prioridad", "archivada", "fechaTerminado", "color"];
const FIELD_TO_SHEET = { mesCompromiso: "mes" };

const ESTADOS = ["Pendiente", "En proceso", "Subido", "Terminado"];
const PRIORIDADES = ["Alta", "Media", "Baja"];
const EMPRESAS = ["Aurum Arquitectos", "YoDesarrollo"];
const ORDER_EMPRESAS = ["Aurum Arquitectos", "YoDesarrollo"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MONTH_INDEX = MESES.reduce((acc, m, i) => ({ ...acc, [m]: i }), {});
const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const PROJECT_ORDER_KEY = "aurum-project-order-v1";

// Paleta default — se usa si la persona no tiene color asignado en el Sheet
const PALETTE_DEFAULTS = [
  "#0F172A", "#1976A3", "#C84949", "#6B7280",
  "#15803D", "#A16207", "#7C3AED", "#0F766E",
  "#BE185D", "#1D4ED8", "#9F1239", "#365314"
];

// Paleta del color picker (12 colores predefinidos)
const COLOR_PICKER_SWATCHES = [
  "#0F172A", "#1976A3", "#C84949", "#6B7280", "#15803D", "#A16207",
  "#7C3AED", "#0F766E", "#BE185D", "#1D4ED8", "#9F1239", "#365314"
];

// ===================================================================
// UTILIDADES
// ===================================================================
function todayStamp() { return new Date().toISOString().slice(0, 10); }
function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `T-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function normalizeUrl(url) {
  const t = String(url || "").trim();
  if (!t) return "";
  if (t.startsWith("http://") || t.startsWith("https://")) return t;
  return "https://" + t;
}
function emptyTask() {
  return { mes: "Mayo", mesCompromiso: "Mayo", empresa: "YoDesarrollo", proyecto: "", responsable: "", semana: "", actividad: "", entregable: "", fecha: "", estado: "Pendiente", prioridad: "Media", observaciones: "", links: [], archivada: false, fechaTerminado: "" };
}

// Color helpers
function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return { r: 100, g: 100, b: 100 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}
function rgbToHex(r, g, b) {
  const clamp = (x) => Math.max(0, Math.min(255, Math.round(x)));
  return "#" + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function softVariant(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * 0.92, g + (255 - g) * 0.92, b + (255 - b) * 0.92);
}
function darkVariant(hex) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * 0.55, g * 0.55, b * 0.55);
}
function hashName(name) {
  let h = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Devuelve {main, soft, text} para una persona, usando override del Sheet o default determinístico
function personPalette(name, colorOverrides) {
  const override = colorOverrides && colorOverrides[name];
  const main = override || PALETTE_DEFAULTS[hashName(name) % PALETTE_DEFAULTS.length];
  return { main, soft: softVariant(main), text: darkVariant(main) };
}

function getDayNumber(f) { const m = String(f || "").match(/(\d{1,2})/); return m ? +m[1] : null; }
function commitmentDate(t) {
  const d = getDayNumber(t.fecha);
  const m = MONTH_INDEX[t.mesCompromiso || t.mes];
  if (d == null || m == null) return null;
  return new Date(new Date().getFullYear(), m, d);
}
function daysUntil(t) {
  const tg = commitmentDate(t);
  if (!tg) return null;
  const today = new Date();
  return Math.round((tg - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
}
function fechaCorta(t) {
  const m = t.mesCompromiso || t.mes || "";
  const d = getDayNumber(t.fecha);
  const sh = { Enero: "Ene", Febrero: "Feb", Marzo: "Mar", Abril: "Abr", Mayo: "May", Junio: "Jun", Julio: "Jul", Agosto: "Ago", Septiembre: "Sep", Octubre: "Oct", Noviembre: "Nov", Diciembre: "Dic" }[m] || m.slice(0, 3);
  return d ? `${sh} ${d}` : t.fecha || "—";
}
function fechaTerminadoCorta(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return null;
  const sh = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][m - 1] || "";
  return `${sh} ${d}`;
}
function urgencyScore(t) {
  if (t.estado === "Terminado") return 999999;
  const d = daysUntil(t);
  const sw = { Pendiente: 0, "En proceso": 0.15, Subido: 0.3 }[t.estado] ?? 0.5;
  const pw = { Alta: -100, Media: 0, Baja: 50 }[t.prioridad] || 0;
  return (d == null ? 9999 : d) + sw + pw;
}
function timeAgo(date) {
  if (!date) return "—";
  const d = Math.floor((Date.now() - date.getTime()) / 1000);
  if (d < 60) return `hace ${d}s`;
  if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
  return date.toLocaleString();
}
function iconForProject(name) {
  const n = String(name || "").toLowerCase();
  if (n.includes("promotora")) return Megaphone;
  if (n.includes("alysa")) return Home;
  if (n.includes("miramar")) return Compass;
  if (n.includes("rnm")) return Building2;
  if (n.includes("clientes") || n.includes("nuevos")) return Users;
  return Folder;
}
function getInitials(name) {
  return String(name || "?").split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase();
}
function isoWeekNumber(y, m, d) {
  const target = new Date(Date.UTC(y, m - 1, d));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
}
function deriveDateFields(dateStr) {
  if (!dateStr) return { mes: "", fecha: "", semana: "" };
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return { mes: "", fecha: "", semana: "" };
  const date = new Date(y, m - 1, d);
  return {
    mes: MESES[m - 1],
    fecha: `${DIAS_SEMANA[date.getDay()]} ${d}`,
    semana: `Semana ${isoWeekNumber(y, m, d)}`,
  };
}
// Inverso: dado un task, intenta reconstruir un dateStr YYYY-MM-DD
function reconstructDateStr(task) {
  const m = MONTH_INDEX[task.mesCompromiso || task.mes];
  const d = getDayNumber(task.fecha);
  if (m == null || d == null) return "";
  const year = new Date().getFullYear();
  return `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Métricas y riesgo por proyecto
function calcProjectMetrics(tasksInProject) {
  const total = tasksInProject.length;
  const term = tasksInProject.filter(t => t.estado === "Terminado").length;
  const overdue = tasksInProject.filter(t => {
    if (t.estado === "Terminado") return false;
    const d = daysUntil(t);
    return d != null && d < 0;
  }).length;
  const soon = tasksInProject.filter(t => {
    if (t.estado === "Terminado") return false;
    const d = daysUntil(t);
    return d != null && d >= 0 && d <= 7;
  }).length;
  const pct = total ? Math.round((term / total) * 100) : 0;
  let risk = "ok";
  const openTotal = total - term;
  const overdueRatio = openTotal > 0 ? overdue / openTotal : 0;
  if (overdue >= 3 || overdueRatio >= 0.5) risk = "critico";
  else if (overdue >= 1) risk = "riesgo";
  else if (soon >= 2) risk = "atencion";
  return { total, term, overdue, soon, pct, risk, openTotal };
}

// Stats de la semana (últimos 7 días basados en fechaTerminado o actualizado)
function calcWeekStats(tasks) {
  const today = new Date();
  const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
  const terminadasSemana = tasks.filter(t => {
    if (t.estado !== "Terminado") return false;
    const ref = t.fechaTerminado || t.actualizado;
    if (!ref) return false;
    const d = new Date(ref);
    return d >= weekAgo;
  }).length;
  const subidasSemana = tasks.filter(t => {
    if (t.estado !== "Subido") return false;
    const ref = t.actualizado;
    if (!ref) return false;
    return new Date(ref) >= weekAgo;
  }).length;
  const vencenSemana = tasks.filter(t => {
    if (t.estado === "Terminado") return false;
    const d = daysUntil(t);
    return d != null && d >= 0 && d <= 7;
  }).length;
  return { terminadasSemana, subidasSemana, vencenSemana };
}

// ===================================================================
// API
// ===================================================================
async function apiCall(action, payload = {}) {
  const body = JSON.stringify({ secret: SHARED_SECRET, action, ...payload });
  let res;
  try {
    res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
    });
  } catch (netErr) {
    throw new Error(`Red/CORS: ${netErr.message}`);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 120)}`);
  }
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`Respuesta no es JSON: ${text.slice(0, 200)}`); }
  if (!data.ok) throw new Error(data.error || "Error desconocido");
  return data;
}

function patchToSheet(patch) {
  const out = {};
  for (const k in patch) {
    const sk = FIELD_TO_SHEET[k] || k;
    if (SHEET_FIELDS.includes(sk)) {
      // Convertir booleanos a strings para el Sheet
      out[sk] = typeof patch[k] === "boolean" ? String(patch[k]) : patch[k];
    }
  }
  return out;
}

// ===================================================================
// MAIN
// ===================================================================
export default function Board() {
  const [tasks, setTasks] = useState(() => {
    try { const c = localStorage.getItem(CACHE_KEY); return c ? JSON.parse(c) : []; } catch { return []; }
  });
  const [filters, setFilters] = useState({ empresa: "Todas", proyecto: "Todos", responsable: "Todos", estado: "Todos", search: "" });
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState(emptyTask());
  const [linkDraft, setLinkDraft] = useState({ label: "", url: "" });
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [expandedProyectos, setExpandedProyectos] = useState({});
  const [expandedProjectRows, setExpandedProjectRows] = useState({});
  const [draggingId, setDraggingId] = useState(null);
  const [draggingTileKey, setDraggingTileKey] = useState(null);
  const [projectOrder, setProjectOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PROJECT_ORDER_KEY) || "{}"); }
    catch { return {}; }
  });
  const [lastSync, setLastSync] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [diagnostic, setDiagnostic] = useState(null);
  const [saveStatus, setSaveStatus] = useState({});
  const [confirmDialog, setConfirmDialog] = useState({ open: false });

  // NUEVOS estados
  const [currentView, setCurrentView] = useState("personas"); // personas | proyectos | estados
  const [showArchived, setShowArchived] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [presenting, setPresenting] = useState(false);

  const pendingPatches = useRef({});
  const debounceTimers = useRef({});
  const recentlyModified = useRef({});
  const tasksRef = useRef(tasks);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  // Mapeo dinámico de colores por responsable: { "Alma": "#1976A3", ... }
  const colorOverrides = useMemo(() => {
    const out = {};
    tasks.forEach(t => {
      if (t.responsable && t.color && String(t.color).trim()) {
        out[t.responsable] = String(t.color).trim();
      }
    });
    return out;
  }, [tasks]);

  const askConfirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setConfirmDialog({
        open: true,
        title: opts.title || "¿Estás seguro?",
        message: opts.message || "Esta acción no se puede deshacer.",
        confirmLabel: opts.confirmLabel || "Eliminar",
        danger: opts.danger !== false,
        onConfirm: () => { setConfirmDialog({ open: false }); resolve(true); },
        onCancel: () => { setConfirmDialog({ open: false }); resolve(false); },
      });
    });
  }, []);

  useEffect(() => {
    apiCall("ping")
      .then(() => setDiagnostic(null))
      .catch(err => setDiagnostic({ message: err.message }));
  }, []);

  const loadFromRemote = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      let remote = null;
      try {
        const result = await apiCall("getAll");
        if (Array.isArray(result.tasks)) remote = result.tasks;
      } catch (apiErr) {
        console.warn("[loadFromRemote] fallback a data.json:", apiErr.message);
      }
      if (!remote) {
        const base = (typeof window !== "undefined" && window.location)
          ? window.location.pathname.replace(/[^/]*$/, "")
          : "/";
        const url = `${base}data.json?t=${Date.now()}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        remote = Array.isArray(data) ? data : data.tasks;
      }
      if (Array.isArray(remote)) {
        const now = Date.now();
        const merged = remote.map(rt => {
          const lm = recentlyModified.current[rt.id];
          if (lm && now - lm < PROTECTION_MS) {
            const local = tasksRef.current.find(t => t.id === rt.id);
            return local || rt;
          }
          return rt;
        });
        setTasks(merged);
        setLastSync(new Date());
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(merged)); } catch {}
      }
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    loadFromRemote();
    const id = setInterval(() => {
      if (Object.keys(pendingPatches.current).length === 0) loadFromRemote();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadFromRemote]);

  const flushTask = useCallback(async (taskId) => {
    const patch = pendingPatches.current[taskId];
    if (!patch || Object.keys(patch).length === 0) return;
    const sheetPatch = patchToSheet(patch);
    if (Object.keys(sheetPatch).length === 0) { delete pendingPatches.current[taskId]; return; }
    pendingPatches.current[taskId] = {};
    if (debounceTimers.current[taskId]) { clearTimeout(debounceTimers.current[taskId]); delete debounceTimers.current[taskId]; }
    setSaveStatus(p => ({ ...p, [taskId]: "saving", [`${taskId}_err`]: null }));
    try {
      await apiCall("update", { id: taskId, patch: sheetPatch });
      recentlyModified.current[taskId] = Date.now();
      setSaveStatus(p => ({ ...p, [taskId]: "saved" }));
      setTimeout(() => {
        setSaveStatus(p => p[taskId] === "saved" ? { ...p, [taskId]: "idle" } : p);
      }, SAVED_FLASH_MS);
    } catch (err) {
      pendingPatches.current[taskId] = { ...sheetPatch, ...(pendingPatches.current[taskId] || {}) };
      setSaveStatus(p => ({ ...p, [taskId]: "error", [`${taskId}_err`]: err.message }));
    }
  }, []);

  const queueChange = useCallback((taskId, patch, immediate = false) => {
    pendingPatches.current[taskId] = { ...(pendingPatches.current[taskId] || {}), ...patch };
    if (immediate) { flushTask(taskId); return; }
    if (debounceTimers.current[taskId]) clearTimeout(debounceTimers.current[taskId]);
    debounceTimers.current[taskId] = setTimeout(() => flushTask(taskId), DEBOUNCE_MS);
  }, [flushTask]);

  const flushAll = useCallback(() => {
    Object.keys(pendingPatches.current).forEach(id => flushTask(id));
  }, [flushTask]);

  useEffect(() => {
    const id = setInterval(() => {
      Object.entries(saveStatus).forEach(([taskId, st]) => {
        if (st === "error" && pendingPatches.current[taskId]) flushTask(taskId);
      });
    }, 30000);
    return () => clearInterval(id);
  }, [saveStatus, flushTask]);

  useEffect(() => {
    const h = () => flushAll();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [flushAll]);

  function updateTaskField(id, patch, immediate = false) {
    // Auto-llenar fechaTerminado cuando el estado cambia a Terminado
    let finalPatch = { ...patch };
    if (patch.estado !== undefined) {
      const current = tasksRef.current.find(t => t.id === id);
      const prevEstado = current?.estado;
      if (patch.estado === "Terminado" && prevEstado !== "Terminado" && !current?.fechaTerminado) {
        finalPatch.fechaTerminado = todayStamp();
      }
      // Si salió de Terminado, limpiar fechaTerminado y archivada
      if (prevEstado === "Terminado" && patch.estado !== "Terminado") {
        finalPatch.fechaTerminado = "";
        finalPatch.archivada = false;
      }
    }
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...finalPatch, actualizado: todayStamp() } : t));
    queueChange(id, finalPatch, immediate);
  }

  // Cambiar color de un responsable (actualiza todas sus tareas)
  async function changePersonaColor(responsable, color) {
    // Actualización optimista local
    setTasks(prev => prev.map(t => t.responsable === responsable ? { ...t, color } : t));
    try {
      await apiCall("setResponsableColor", { responsable, color });
    } catch (err) {
      alert(`Error cambiando color de ${responsable}: ${err.message}`);
      loadFromRemote();
    }
  }

  async function addTask() {
    if (!newTask.proyecto.trim() || !newTask.responsable.trim() || !newTask.actividad.trim()) {
      alert("Completa proyecto, responsable y actividad."); return;
    }
    const tempId = makeId();
    const tempTask = { ...newTask, id: tempId, mes: newTask.mesCompromiso || newTask.mes, creado: todayStamp(), actualizado: todayStamp(), links: [], archivada: false, fechaTerminado: "" };
    setTasks(prev => [tempTask, ...prev]);
    setNewTask(emptyTask());
    setShowForm(false);
    setSaveStatus(p => ({ ...p, [tempId]: "saving" }));
    try {
      const sheetTask = patchToSheet({ ...tempTask, mesCompromiso: tempTask.mesCompromiso });
      const result = await apiCall("create", { task: sheetTask });
      setTasks(prev => prev.map(t => t.id === tempId ? { ...t, id: result.id } : t));
      recentlyModified.current[result.id] = Date.now();
      setSaveStatus(p => { const n = { ...p }; delete n[tempId]; n[result.id] = "saved"; return n; });
      setTimeout(() => setSaveStatus(p => p[result.id] === "saved" ? { ...p, [result.id]: "idle" } : p), SAVED_FLASH_MS);
    } catch (err) {
      setSaveStatus(p => ({ ...p, [tempId]: "error", [`${tempId}_err`]: err.message }));
    }
  }

  async function addLink(taskId) {
    const url = normalizeUrl(linkDraft.url);
    if (!url) return;
    const label = linkDraft.label?.trim() || "Evidencia";
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const link = { id: makeId(), label, url, fechaSubida: todayStamp() };
      const next = (t.estado === "Pendiente" || t.estado === "En proceso") ? "Subido" : t.estado;
      return { ...t, links: [...(t.links || []), link], estado: next };
    }));
    setLinkDraft({ label: "", url: "" });
    setSaveStatus(p => ({ ...p, [taskId]: "saving" }));
    try {
      await apiCall("addLink", { id: taskId, url, label });
      const t = tasksRef.current.find(t => t.id === taskId);
      if (t && t.estado === "Subido") await apiCall("update", { id: taskId, patch: { estado: "Subido" } });
      recentlyModified.current[taskId] = Date.now();
      setSaveStatus(p => ({ ...p, [taskId]: "saved" }));
      setTimeout(() => setSaveStatus(p => p[taskId] === "saved" ? { ...p, [taskId]: "idle" } : p), SAVED_FLASH_MS);
    } catch (err) {
      setSaveStatus(p => ({ ...p, [taskId]: "error", [`${taskId}_err`]: err.message }));
    }
  }

  async function removeLinkConfirmed(taskId, linkId) {
    const t = tasksRef.current.find(t => t.id === taskId);
    const link = t?.links?.find(l => l.id === linkId);
    if (!link) return;
    const ok = await askConfirm({
      title: "Eliminar evidencia",
      message: `Vas a quitar "${link.label}". Acción definitiva.`,
      confirmLabel: "Sí, eliminar"
    });
    if (!ok) return;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, links: t.links.filter(l => l.id !== linkId) } : t));
    setSaveStatus(p => ({ ...p, [taskId]: "saving" }));
    try {
      await apiCall("removeLink", { id: taskId, url: link.url });
      recentlyModified.current[taskId] = Date.now();
      setSaveStatus(p => ({ ...p, [taskId]: "saved" }));
      setTimeout(() => setSaveStatus(p => p[taskId] === "saved" ? { ...p, [taskId]: "idle" } : p), SAVED_FLASH_MS);
    } catch (err) {
      setSaveStatus(p => ({ ...p, [taskId]: "error", [`${taskId}_err`]: err.message }));
    }
  }

  async function deleteTask(taskId) {
    const t = tasksRef.current.find(t => t.id === taskId);
    const ok = await askConfirm({
      title: "Eliminar tarea",
      message: `Vas a eliminar "${t?.actividad || taskId}" del Sheet. Esta acción es definitiva.`,
      confirmLabel: "Sí, eliminar definitivamente"
    });
    if (!ok) return;
    const backup = t;
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setSelectedTaskId(null);
    try {
      await apiCall("delete", { id: taskId });
      delete recentlyModified.current[taskId];
    } catch (err) {
      if (backup) setTasks(prev => [backup, ...prev]);
      alert("Error al eliminar: " + err.message);
    }
  }

  function changeStatusByDrag(taskId, newStatus) {
    updateTaskField(taskId, { estado: newStatus }, true);
  }

  function closeSubboard() {
    if (selectedTaskId) flushTask(selectedTaskId);
    setSelectedTaskId(null);
  }

  function toggleProyecto(key) { setExpandedProyectos(prev => ({ ...prev, [key]: !prev[key] })); }
  function toggleProjectRow(key) { setExpandedProjectRows(prev => ({ ...prev, [key]: !prev[key] })); }

  const reorderProjects = useCallback((persona, empresa, fromIdx, toIdx, allProjects) => {
    setProjectOrder(prev => {
      const key = `${persona}::${empresa}`;
      const baseList = (prev[key] && prev[key].length > 0)
        ? [...prev[key].filter(p => allProjects.includes(p)), ...allProjects.filter(p => !prev[key].includes(p))]
        : [...allProjects];
      if (fromIdx < 0 || toIdx < 0 || fromIdx >= baseList.length || toIdx >= baseList.length) return prev;
      const [moved] = baseList.splice(fromIdx, 1);
      baseList.splice(toIdx, 0, moved);
      const next = { ...prev, [key]: baseList };
      try { localStorage.setItem(PROJECT_ORDER_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // ----- DERIVADOS -----
  const projects = useMemo(() => ["Todos", ...Array.from(new Set(tasks.map(t => t.proyecto).filter(Boolean))).sort()], [tasks]);
  const responsables = useMemo(() => ["Todos", ...Array.from(new Set(tasks.map(t => t.responsable).filter(Boolean))).sort()], [tasks]);
  const existingProjects = useMemo(() => projects.filter(p => p !== "Todos"), [projects]);
  const existingResponsables = useMemo(() => responsables.filter(r => r !== "Todos"), [responsables]);
  const existingActividades = useMemo(() => Array.from(new Set(tasks.map(t => t.actividad).filter(Boolean))).sort(), [tasks]);
  const archivedCount = useMemo(() => tasks.filter(t => t.archivada).length, [tasks]);

  // Lista de personas únicas para el panel de ajustes
  const allPersonas = useMemo(() => {
    return Array.from(new Set(tasks.map(t => t.responsable).filter(Boolean))).sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const term = filters.search.trim().toLowerCase();
    return tasks.filter(t => {
      // Filtrar archivadas según el toggle
      if (!showArchived && t.archivada) return false;
      if (filters.empresa !== "Todas" && t.empresa !== filters.empresa) return false;
      if (filters.proyecto !== "Todos" && t.proyecto !== filters.proyecto) return false;
      if (filters.responsable !== "Todos" && t.responsable !== filters.responsable) return false;
      if (filters.estado !== "Todos" && t.estado !== filters.estado) return false;
      if (term) {
        const hay = `${t.empresa} ${t.proyecto} ${t.responsable} ${t.actividad} ${t.entregable} ${t.observaciones}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [tasks, filters, showArchived]);

  // Jerarquía (vista Personas): { Persona: { Empresa: { Proyecto: [tareas] } } }
  const hierarchy = useMemo(() => {
    const h = {};
    filteredTasks.forEach(t => {
      const p = t.responsable || "Sin responsable";
      const e = t.empresa || "Sin empresa";
      const pr = t.proyecto || "Sin proyecto";
      if (!h[p]) h[p] = {};
      if (!h[p][e]) h[p][e] = {};
      if (!h[p][e][pr]) h[p][e][pr] = [];
      h[p][e][pr].push(t);
    });
    Object.values(h).forEach(empresas => {
      Object.values(empresas).forEach(proys => {
        Object.values(proys).forEach(arr => arr.sort((a, b) => urgencyScore(a) - urgencyScore(b)));
      });
    });
    return h;
  }, [filteredTasks]);

  const personasOrdenadas = useMemo(() => {
    return Object.keys(hierarchy).sort((a, b) => a.localeCompare(b));
  }, [hierarchy]);

  // Vista Proyectos: lista de proyectos con métricas/riesgo
  const projectsList = useMemo(() => {
    const byProject = {};
    filteredTasks.forEach(t => {
      const key = `${t.empresa}::${t.proyecto}`;
      if (!byProject[key]) byProject[key] = { empresa: t.empresa, proyecto: t.proyecto, tasks: [] };
      byProject[key].tasks.push(t);
    });
    return Object.values(byProject).map(p => ({
      ...p,
      key: `${p.empresa}::${p.proyecto}`,
      metrics: calcProjectMetrics(p.tasks),
      asignados: Array.from(new Set(p.tasks.map(t => t.responsable).filter(Boolean))),
    })).sort((a, b) => {
      const order = { critico: 0, riesgo: 1, atencion: 2, ok: 3 };
      const diff = order[a.metrics.risk] - order[b.metrics.risk];
      if (diff !== 0) return diff;
      return a.proyecto.localeCompare(b.proyecto);
    });
  }, [filteredTasks]);

  const metrics = useMemo(() => {
    const total = filteredTasks.length;
    const term = filteredTasks.filter(t => t.estado === "Terminado").length;
    const sub = filteredTasks.filter(t => t.estado === "Subido").length;
    const pen = filteredTasks.filter(t => t.estado === "Pendiente").length;
    const proc = filteredTasks.filter(t => t.estado === "En proceso").length;
    const links = filteredTasks.reduce((s, t) => s + (t.links?.length || 0), 0);
    return { total, term, sub, pen, proc, links, avance: total ? Math.round(term / total * 100) : 0 };
  }, [filteredTasks]);

  // Stats de la semana para el briefing (usar TODAS las tareas, no solo filtradas)
  const weekStats = useMemo(() => calcWeekStats(tasks), [tasks]);
  const riskyProjects = useMemo(() => projectsList.filter(p => p.metrics.risk === "critico" || p.metrics.risk === "riesgo").slice(0, 4), [projectsList]);

  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedTaskId) || null, [tasks, selectedTaskId]);

  const globalSync = useMemo(() => {
    const errs = Object.entries(saveStatus).filter(([k, v]) => v === "error" && !k.endsWith("_err")).length;
    const sav = Object.entries(saveStatus).filter(([k, v]) => v === "saving" && !k.endsWith("_err")).length;
    if (errs > 0) return { type: "error", text: `${errs} con error · reintentando` };
    if (sav > 0) return { type: "saving", text: `Guardando ${sav}…` };
    return { type: "idle", text: `Última lectura ${timeAgo(lastSync)}` };
  }, [saveStatus, lastSync]);

  // ===========================================================
  // RENDER: SUBBOARD
  // ===========================================================
  if (selectedTask) {
    const status = saveStatus[selectedTask.id];
    const errMsg = saveStatus[`${selectedTask.id}_err`];
    const taskDateStr = reconstructDateStr(selectedTask);
    const isTerminada = selectedTask.estado === "Terminado";

    return (
      <div className="brand-shell yo-theme min-h-screen">
        <div className="mx-auto max-w-5xl px-4 py-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button onClick={closeSubboard} className="btn-ghost">← Regresar al board</button>
            <SaveBadge status={status} errorMsg={errMsg} onRetry={() => flushTask(selectedTask.id)} />
          </div>
          <header className="yo-card p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="yo-eyebrow">Subboard de tarea</p>
                <h1 className="yo-display mt-1">{selectedTask.actividad}</h1>
                <p className="mt-1 text-sm text-stone-500">{selectedTask.proyecto} · {selectedTask.responsable}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                  <EstadoChip estado={selectedTask.estado} />
                  <PrioridadChip prioridad={selectedTask.prioridad} />
                  {!isTerminada && <DeadlineBadge task={selectedTask} />}
                  {isTerminada && selectedTask.fechaTerminado && (
                    <span className="terminada-pill">✓ Terminada {fechaTerminadoCorta(selectedTask.fechaTerminado)}</span>
                  )}
                  {selectedTask.archivada && <span className="archivada-pill">📁 Archivada</span>}
                </div>
                <p className="mt-2 text-xs yo-success">✓ Cada cambio se guarda automáticamente.</p>
              </div>
              <div className="flex gap-2">
                {!isTerminada && (
                  <button onClick={() => updateTaskField(selectedTask.id, { estado: "Terminado" }, true)} className="yo-btn-primary">Marcar terminada</button>
                )}
                <button onClick={() => deleteTask(selectedTask.id)} className="yo-btn-danger">Eliminar</button>
              </div>
            </div>
          </header>

          {/* Checkbox archivar — solo visible si está Terminada */}
          {isTerminada && (
            <div className="archive-control mt-3">
              <label className="archive-label">
                <input
                  type="checkbox"
                  checked={!!selectedTask.archivada}
                  onChange={(e) => updateTaskField(selectedTask.id, { archivada: e.target.checked }, true)}
                />
                <Archive size={14} />
                <span>{selectedTask.archivada ? "Archivada — ocúltala del board principal" : "Archivar esta tarea — la oculta del board pero queda en el Sheet"}</span>
              </label>
              <p className="archive-hint">Para verla de nuevo, prende "Ver archivadas" en el header del board.</p>
            </div>
          )}

          <main className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
            <section className="yo-card p-5">
              <h2 className="yo-eyebrow mb-4">Datos</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Empresa">
                  <select className="input" value={selectedTask.empresa} onChange={e => updateTaskField(selectedTask.id, { empresa: e.target.value }, true)}>
                    {EMPRESAS.map(e => <option key={e}>{e}</option>)}
                  </select>
                </Field>
                <Field label="Proyecto">
                  <input className="input" value={selectedTask.proyecto || ""} onChange={e => updateTaskField(selectedTask.id, { proyecto: e.target.value })} />
                </Field>
                <Field label="Responsable">
                  <input className="input" value={selectedTask.responsable || ""} onChange={e => updateTaskField(selectedTask.id, { responsable: e.target.value })} />
                </Field>
                <Field label="Fecha (calendario)">
                  <input
                    type="date"
                    className="input"
                    value={taskDateStr}
                    onChange={e => {
                      const ds = e.target.value;
                      const derived = deriveDateFields(ds);
                      updateTaskField(selectedTask.id, {
                        fecha: derived.fecha,
                        semana: derived.semana,
                        mes: derived.mes,
                        mesCompromiso: derived.mes,
                      }, true);
                    }}
                  />
                  {taskDateStr && (
                    <div className="form-derived" style={{marginTop: '0.4rem'}}>
                      {selectedTask.mes} · {selectedTask.fecha} · {selectedTask.semana}
                    </div>
                  )}
                </Field>
                <Field label="Estado">
                  <select className="input" value={selectedTask.estado} onChange={e => updateTaskField(selectedTask.id, { estado: e.target.value }, true)}>
                    {ESTADOS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Prioridad">
                  <select className="input" value={selectedTask.prioridad || "Media"} onChange={e => updateTaskField(selectedTask.id, { prioridad: e.target.value }, true)}>
                    {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </Field>
              </div>
              <div className="mt-4 grid gap-3">
                <Field label="Actividad">
                  <textarea className="input min-h-[80px]" value={selectedTask.actividad || ""} onChange={e => updateTaskField(selectedTask.id, { actividad: e.target.value })} />
                </Field>
                <Field label="Entregable">
                  <textarea className="input min-h-[80px]" value={selectedTask.entregable || ""} onChange={e => updateTaskField(selectedTask.id, { entregable: e.target.value })} />
                </Field>
                <Field label="Observaciones">
                  <textarea className="input min-h-[120px]" value={selectedTask.observaciones || ""} onChange={e => updateTaskField(selectedTask.id, { observaciones: e.target.value })} placeholder="Notas, bloqueos, contexto…" />
                </Field>
              </div>
            </section>

            <aside className="space-y-5">
              <section className="yo-card p-5">
                <h2 className="yo-eyebrow mb-4">Evidencias</h2>
                <div className="space-y-2">
                  {(selectedTask.links || []).length === 0 && <p className="text-sm text-stone-400 p-3 bg-stone-50">Sin archivos.</p>}
                  {(selectedTask.links || []).map(link => (
                    <div key={link.id} className="border border-stone-200 p-3">
                      <a href={link.url} target="_blank" rel="noreferrer" className="block text-sm font-bold text-stone-900 hover:underline break-all">{link.label}</a>
                      <div className="mt-1 text-xs text-stone-400 break-all">{link.url}</div>
                      <button onClick={() => removeLinkConfirmed(selectedTask.id, link.id)} className="mt-2 text-xs font-bold text-red-600 hover:text-red-800">Eliminar</button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-2 border-t border-stone-200 pt-4">
                  <input className="input" value={linkDraft.label} onChange={e => setLinkDraft({ ...linkDraft, label: e.target.value })} placeholder="Nombre del archivo" />
                  <input className="input" value={linkDraft.url} onChange={e => setLinkDraft({ ...linkDraft, url: e.target.value })} placeholder="URL de Drive" />
                  <button onClick={() => addLink(selectedTask.id)} className="yo-btn-primary w-full"><Link2 size={14}/>Guardar evidencia</button>
                </div>
              </section>
            </aside>
          </main>
        </div>
        <ConfirmModal dialog={confirmDialog} />
        <GlobalStyles />
      </div>
    );
  }

  // ===========================================================
  // RENDER: BOARD PRINCIPAL
  // ===========================================================
  return (
    <div className="brand-shell yo-theme min-h-screen">
      <div className="mx-auto max-w-[1760px] px-3 py-4">
        {/* HEADER */}
        <header className="yo-header mb-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <CompanyLogos />
              <div>
                <p className="yo-eyebrow">Aurum Arquitectos · YoDesarrollo</p>
                <h1 className="yo-display text-xl mt-0.5">Board operativo</h1>
                <p className="text-xs text-stone-500 mt-0.5">
                  <GlobalSyncBadge status={globalSync} />
                  {syncError && <span className="ml-2 text-red-600">· lectura: {syncError}</span>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              <ViewSelector value={currentView} onChange={setCurrentView} />
              <label className="archive-toggle" title="Mostrar tareas archivadas">
                <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
                {showArchived ? <Eye size={12}/> : <EyeOff size={12}/>}
                <span>{showArchived ? "Ocultar archivadas" : "Ver archivadas"}</span>
                {archivedCount > 0 && <span className="archive-toggle-cnt">{archivedCount}</span>}
              </label>
              <button onClick={() => setShowSettings(true)} className="yo-btn-secondary" title="Ajustes de colores"><Settings size={12}/></button>
              <button onClick={() => setPresenting(true)} className="yo-btn-secondary" title="Modo presentación"><Play size={12}/></button>
              <button onClick={loadFromRemote} className="yo-btn-secondary" disabled={syncing} title="Forzar lectura"><RefreshCw size={12}/>{syncing ? "…" : ""}</button>
              <button onClick={() => setShowForm(v => !v)} className="yo-btn-primary"><Plus size={14}/>Tarea</button>
            </div>
          </div>
        </header>

        {/* DIAGNOSTIC */}
        {diagnostic && (
          <div className="diagnostic-banner mb-3">
            <AlertCircle size={18} className="shrink-0" />
            <div>
              <strong>No conecta al Sheet.</strong> {diagnostic.message}
              <div className="text-xs mt-1 opacity-80">Las lecturas siguen funcionando pero los cambios no se guardan. Verifica la URL del Apps Script.</div>
            </div>
          </div>
        )}

        {/* BRIEFING SEMANAL */}
        <WeekBriefing
          stats={weekStats}
          risky={riskyProjects}
          colorOverrides={colorOverrides}
          onProjectClick={(p) => {
            setCurrentView("proyectos");
            setExpandedProjectRows({ [p.key]: true });
          }}
        />

        {/* MÉTRICAS */}
        <section className="mb-3 grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          <Metric label="Total" value={metrics.total} />
          <Metric label="Pend." value={metrics.pen} tone="pendiente" />
          <Metric label="Proceso" value={metrics.proc} tone="en-proceso" />
          <Metric label="Subidas" value={metrics.sub} tone="subido" />
          <Metric label="Term." value={metrics.term} tone="terminado" />
          <Metric label="Avance" value={`${metrics.avance}%`} />
        </section>

        {/* FILTROS */}
        <section className="mb-3 yo-card p-2">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Field label="Empresa"><select className="input" value={filters.empresa} onChange={e => setFilters({ ...filters, empresa: e.target.value })}><option>Todas</option>{EMPRESAS.map(e => <option key={e}>{e}</option>)}</select></Field>
            <Field label="Proyecto"><select className="input" value={filters.proyecto} onChange={e => setFilters({ ...filters, proyecto: e.target.value })}>{projects.map(p => <option key={p}>{p}</option>)}</select></Field>
            <Field label="Responsable"><select className="input" value={filters.responsable} onChange={e => setFilters({ ...filters, responsable: e.target.value })}>{responsables.map(r => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Estado"><select className="input" value={filters.estado} onChange={e => setFilters({ ...filters, estado: e.target.value })}><option>Todos</option>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Buscar"><input className="input" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} placeholder="Texto…" /></Field>
          </div>
        </section>

        {/* FORM NUEVA TAREA */}
        {showForm && (
          <section className="mb-3 yo-card p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="yo-eyebrow">Nueva tarea</h2>
              <button onClick={() => setShowForm(false)} className="btn-ghost"><X size={14}/></button>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <Field label="Empresa">
                <select value={newTask.empresa} onChange={e => setNewTask({ ...newTask, empresa: e.target.value })} className="input">
                  {EMPRESAS.map(e => <option key={e}>{e}</option>)}
                </select>
              </Field>
              <Field label="Proyecto (existente o nuevo)">
                <input className="input" list="dl-proyectos" value={newTask.proyecto} onChange={e => setNewTask({ ...newTask, proyecto: e.target.value })} placeholder="Selecciona o escribe nuevo" />
                <datalist id="dl-proyectos">{existingProjects.map(p => <option key={p} value={p} />)}</datalist>
              </Field>
              <Field label="Responsable (existente o nuevo)">
                <input className="input" list="dl-responsables" value={newTask.responsable} onChange={e => setNewTask({ ...newTask, responsable: e.target.value })} placeholder="Selecciona o escribe nuevo" />
                <datalist id="dl-responsables">{existingResponsables.map(r => <option key={r} value={r} />)}</datalist>
              </Field>
              <Field label="Fecha (calendario)">
                <input type="date" className="input" value={newTask._dateStr || ""} onChange={e => {
                  const ds = e.target.value;
                  const d = deriveDateFields(ds);
                  setNewTask({ ...newTask, _dateStr: ds, fecha: d.fecha, semana: d.semana, mes: d.mes, mesCompromiso: d.mes });
                }} />
              </Field>
              <Field label="Prioridad">
                <select className="input" value={newTask.prioridad} onChange={e => setNewTask({ ...newTask, prioridad: e.target.value })}>
                  {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Estado">
                <select className="input" value={newTask.estado} onChange={e => setNewTask({ ...newTask, estado: e.target.value })}>
                  {ESTADOS.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid gap-2 mt-2">
              <Field label="Actividad (existente o nueva)">
                <input className="input" list="dl-actividades" value={newTask.actividad} onChange={e => setNewTask({ ...newTask, actividad: e.target.value })} placeholder="Selecciona o escribe nueva" />
                <datalist id="dl-actividades">{existingActividades.map(a => <option key={a} value={a} />)}</datalist>
              </Field>
              <Field label="Entregable">
                <input className="input" value={newTask.entregable} onChange={e => setNewTask({ ...newTask, entregable: e.target.value })} />
              </Field>
            </div>
            {newTask._dateStr && (
              <div className="mt-2 form-derived">
                Se guardará en el Sheet como: <strong>{newTask.mes}</strong> · <strong>{newTask.fecha}</strong> · <strong>{newTask.semana}</strong>
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <button onClick={addTask} className="yo-btn-primary"><Plus size={14}/>Crear en Sheet</button>
            </div>
          </section>
        )}

        {/* VISTAS */}
        <main>
          {currentView === "personas" && (
            <PersonasView
              personas={personasOrdenadas}
              hierarchy={hierarchy}
              tasksLength={tasks.length}
              expandedProyectos={expandedProyectos}
              toggleProyecto={toggleProyecto}
              setSelectedTaskId={setSelectedTaskId}
              changeStatusByDrag={changeStatusByDrag}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              saveStatus={saveStatus}
              projectOrder={projectOrder}
              reorderProjects={reorderProjects}
              draggingTileKey={draggingTileKey}
              setDraggingTileKey={setDraggingTileKey}
              colorOverrides={colorOverrides}
            />
          )}
          {currentView === "proyectos" && (
            <ProjectsView
              projectsList={projectsList}
              expandedProjectRows={expandedProjectRows}
              toggleProjectRow={toggleProjectRow}
              setSelectedTaskId={setSelectedTaskId}
              colorOverrides={colorOverrides}
            />
          )}
          {currentView === "estados" && (
            <EstadosView
              tasks={filteredTasks}
              setSelectedTaskId={setSelectedTaskId}
              changeStatusByDrag={changeStatusByDrag}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              saveStatus={saveStatus}
              colorOverrides={colorOverrides}
            />
          )}
        </main>
      </div>

      {showSettings && (
        <SettingsPanel
          personas={allPersonas}
          colorOverrides={colorOverrides}
          onChangeColor={changePersonaColor}
          onClose={() => setShowSettings(false)}
        />
      )}

      {presenting && (
        <PresentationMode
          tasks={tasks}
          weekStats={weekStats}
          riskyProjects={projectsList.filter(p => p.metrics.risk === "critico" || p.metrics.risk === "riesgo")}
          colorOverrides={colorOverrides}
          onClose={() => setPresenting(false)}
        />
      )}

      <ConfirmModal dialog={confirmDialog} />
      <GlobalStyles />
    </div>
  );
}

// ===================================================================
// VIEW SELECTOR (3 vistas)
// ===================================================================
function ViewSelector({ value, onChange }) {
  const opts = [
    { id: "personas", label: "Personas", Icon: Users },
    { id: "proyectos", label: "Proyectos", Icon: Folder },
    { id: "estados", label: "Estados", Icon: LayoutGrid },
  ];
  return (
    <div className="view-selector">
      {opts.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`vs-btn ${value === id ? "on" : ""}`}
          title={label}
        >
          <Icon size={12} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

// ===================================================================
// BRIEFING SEMANAL
// ===================================================================
function WeekBriefing({ stats, risky, colorOverrides, onProjectClick }) {
  return (
    <section className="brief">
      <div className="brief-col brief-col-stats">
        <div className="brief-lbl">Esta semana</div>
        <div className="brief-stats">
          <BriefStat n={stats.terminadasSemana} label="terminadas" />
          <BriefStat n={stats.subidasSemana} label="a revisión" />
          <BriefStat n={stats.vencenSemana} label="vencen 7d" />
        </div>
      </div>
      <div className="brief-divider" />
      <div className="brief-col brief-col-risks">
        <div className="brief-lbl">
          <span style={{ color: "#DC2626" }}>●</span> Proyectos en riesgo
          <span className="brief-lbl-cnt">{risky.length}</span>
        </div>
        {risky.length === 0 ? (
          <div className="brief-empty">Todos los proyectos en plazo.</div>
        ) : (
          <div className="risk-row">
            {risky.map(p => (
              <button key={p.key} className={`risk-card risk-${p.metrics.risk}`} onClick={() => onProjectClick(p)}>
                <div className="risk-head">
                  <span className="risk-name">{p.proyecto}</span>
                  <span className="risk-pct">{p.metrics.pct}%</span>
                </div>
                <div className="risk-meta">
                  <span>{p.metrics.overdue} atrasadas</span>
                  <span className="dot">·</span>
                  <span>{p.empresa}</span>
                </div>
                <ProgressBar pct={p.metrics.pct} risk={p.metrics.risk} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function BriefStat({ n, label }) {
  return (
    <div className="brief-stat">
      <div className="brief-stat-n">{n}</div>
      <div className="brief-stat-l">{label}</div>
    </div>
  );
}

function ProgressBar({ pct, risk = "ok" }) {
  return (
    <div className={`progress progress-${risk}`}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ===================================================================
// VISTA: PERSONAS
// ===================================================================
function PersonasView({ personas, hierarchy, tasksLength, expandedProyectos, toggleProyecto, setSelectedTaskId, changeStatusByDrag, draggingId, setDraggingId, saveStatus, projectOrder, reorderProjects, draggingTileKey, setDraggingTileKey, colorOverrides }) {
  if (personas.length === 0) {
    return (
      <div className="yo-card p-8 text-center text-sm text-stone-400">
        {tasksLength === 0 ? "Cargando tareas desde el Sheet…" : "Sin tareas con los filtros actuales."}
      </div>
    );
  }
  return (
    <div className="personas-columns">
      {personas.map(persona => (
        <PersonaColumn
          key={persona}
          persona={persona}
          dataByEmpresa={hierarchy[persona]}
          expandedProyectos={expandedProyectos}
          onToggleProyecto={toggleProyecto}
          onOpenTask={setSelectedTaskId}
          onStatusChange={changeStatusByDrag}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
          saveStatus={saveStatus}
          projectOrder={projectOrder}
          onReorderProjects={reorderProjects}
          draggingTileKey={draggingTileKey}
          setDraggingTileKey={setDraggingTileKey}
          colorOverrides={colorOverrides}
        />
      ))}
    </div>
  );
}

function PersonaColumn({ persona, dataByEmpresa, expandedProyectos, onToggleProyecto, onOpenTask, onStatusChange, draggingId, setDraggingId, saveStatus, projectOrder, onReorderProjects, draggingTileKey, setDraggingTileKey, colorOverrides }) {
  const palette = personPalette(persona, colorOverrides);
  const empresasOrdenadas = Object.keys(dataByEmpresa).sort((a, b) => {
    const ai = ORDER_EMPRESAS.indexOf(a), bi = ORDER_EMPRESAS.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.localeCompare(b);
  });
  const allTasks = Object.values(dataByEmpresa).flatMap(emp => Object.values(emp).flat());
  const total = allTasks.length;
  const cerradas = allTasks.filter(t => t.estado === "Terminado").length;
  const altas = allTasks.filter(t => t.prioridad === "Alta" && t.estado !== "Terminado").length;

  return (
    <section className="persona-column" style={{ borderTopColor: palette.main }}>
      <header className="persona-column-header" style={{ background: palette.soft }}>
        <PersonaAvatar name={persona} size={36} colorOverrides={colorOverrides} />
        <div className="persona-column-info">
          <h2 className="persona-column-name" style={{ color: palette.text }}>{persona}</h2>
          <div className="persona-column-meta">
            <span>{cerradas}/{total}</span>
            {altas > 0 && <span className="urgent-pill"><Zap size={9}/>{altas}</span>}
          </div>
        </div>
      </header>
      <div className="persona-column-body">
        {empresasOrdenadas.map(empresa => (
          <EmpresaBlock
            key={empresa}
            empresa={empresa}
            persona={persona}
            proyectos={dataByEmpresa[empresa]}
            expandedProyectos={expandedProyectos}
            onToggleProyecto={onToggleProyecto}
            onOpenTask={onOpenTask}
            onStatusChange={onStatusChange}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
            saveStatus={saveStatus}
            projectOrder={projectOrder}
            onReorderProjects={onReorderProjects}
            draggingTileKey={draggingTileKey}
            setDraggingTileKey={setDraggingTileKey}
            colorOverrides={colorOverrides}
          />
        ))}
      </div>
    </section>
  );
}

function EmpresaBlock({ empresa, persona, proyectos, expandedProyectos, onToggleProyecto, onOpenTask, onStatusChange, draggingId, setDraggingId, saveStatus, projectOrder, onReorderProjects, draggingTileKey, setDraggingTileKey, colorOverrides }) {
  const allNames = Object.keys(proyectos);
  const orderKey = `${persona}::${empresa}`;
  const stored = (projectOrder && projectOrder[orderKey]) || [];
  const ordered = stored.filter(p => allNames.includes(p));
  const remaining = allNames.filter(p => !ordered.includes(p)).sort();
  const proyectosNombres = [...ordered, ...remaining];

  return (
    <div className="empresa-block">
      <div className="empresa-header-mini">
        <CompanyLogo name={empresa} size={14} />
        <span className="empresa-name-mini">{empresa}</span>
      </div>
      <div className="proyectos-row">
        {proyectosNombres.map((proyecto, idx) => {
          const key = `${persona}::${empresa}::${proyecto}`;
          const expanded = !!expandedProyectos[key];
          return (
            <ProyectoTileCompact
              key={proyecto}
              proyecto={proyecto}
              persona={persona}
              empresa={empresa}
              index={idx}
              tileKey={key}
              tasks={proyectos[proyecto]}
              expanded={expanded}
              onToggle={() => onToggleProyecto(key)}
              onOpenTask={onOpenTask}
              onStatusChange={onStatusChange}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              saveStatus={saveStatus}
              onReorder={(fromIdx, toIdx) => onReorderProjects(persona, empresa, fromIdx, toIdx, proyectosNombres)}
              draggingTileKey={draggingTileKey}
              setDraggingTileKey={setDraggingTileKey}
            />
          );
        })}
      </div>
    </div>
  );
}

function ProyectoTileCompact({ proyecto, persona, empresa, index, tileKey, tasks, expanded, onToggle, onOpenTask, onStatusChange, draggingId, setDraggingId, saveStatus, onReorder, draggingTileKey, setDraggingTileKey }) {
  const Icon = iconForProject(proyecto);
  const pen = tasks.filter(t => t.estado === "Pendiente").length;
  const proc = tasks.filter(t => t.estado === "En proceso").length;
  const sub = tasks.filter(t => t.estado === "Subido").length;
  const term = tasks.filter(t => t.estado === "Terminado").length;
  const altas = tasks.filter(t => t.prioridad === "Alta" && t.estado !== "Terminado").length;
  const [over, setOver] = useState(false);
  const isDragging = draggingTileKey === tileKey;

  function handleDragStart(e) {
    e.stopPropagation();
    e.dataTransfer.setData("application/x-aurum-tile", JSON.stringify({ persona, empresa, index }));
    e.dataTransfer.effectAllowed = "move";
    setDraggingTileKey(tileKey);
  }
  function handleDragEnd() {
    setDraggingTileKey(null);
    setOver(false);
  }
  function handleDragOver(e) {
    if (!e.dataTransfer.types.includes("application/x-aurum-tile")) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(true);
  }
  function handleDragLeave() { setOver(false); }
  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const raw = e.dataTransfer.getData("application/x-aurum-tile");
    if (!raw) return;
    try {
      const src = JSON.parse(raw);
      if (src.persona !== persona || src.empresa !== empresa) return;
      if (src.index === index) return;
      onReorder(src.index, index);
    } catch {}
  }

  return (
    <div
      className={`proyecto-tile ${expanded ? "expanded" : ""} ${isDragging ? "tile-dragging" : ""} ${over ? "tile-drop-over" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button onClick={onToggle} className="proyecto-tile-button" title={proyecto}>
        <div className="proyecto-tile-top">
          <span
            className="drag-handle"
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={e => e.stopPropagation()}
            title="Arrastra para reordenar"
          >⋮⋮</span>
          <Icon size={11} />
          <span className="proyecto-tile-name">{proyecto}</span>
          {altas > 0 && !expanded && <span className="alta-mini"><Zap size={8}/>{altas}</span>}
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </div>
        <div className="proyecto-tile-stats">
          <span className="stat-pen" title="Pendientes">{pen}</span>
          <span className="stat-proc" title="En proceso">{proc}</span>
          <span className="stat-sub" title="Subidas">{sub}</span>
          <span className="stat-term" title="Terminadas">{term}</span>
        </div>
      </button>
      {expanded && (
        <div className="proyecto-tile-kanban">
          <ProjectKanbanVertical
            tasks={tasks}
            onOpen={onOpenTask}
            onStatusChange={onStatusChange}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
            saveStatus={saveStatus}
          />
        </div>
      )}
    </div>
  );
}

function ProjectKanbanVertical({ tasks, onOpen, onStatusChange, draggingId, setDraggingId, saveStatus }) {
  return (
    <div className="kanban-vertical">
      {ESTADOS.map(estado => (
        <KanbanColumn
          key={estado}
          status={estado}
          tasks={tasks.filter(t => t.estado === estado)}
          onDrop={(taskId) => onStatusChange(taskId, estado)}
          onOpen={onOpen}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
          saveStatus={saveStatus}
        />
      ))}
    </div>
  );
}

function KanbanColumn({ status, tasks, onDrop, onOpen, draggingId, setDraggingId, saveStatus }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`kanban-col kanban-col-${status.replace(/\s+/g, "-").toLowerCase()} ${over ? "over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        setOver(false);
        if (id) onDrop(id);
      }}
    >
      <div className="kanban-col-header">
        <span>{status}</span>
        <span className="kanban-count">{tasks.length}</span>
      </div>
      <div className="kanban-col-body">
        {tasks.length === 0 && <div className="kanban-empty">—</div>}
        {tasks.map(task => (
          <KanbanCard
            key={task.id}
            task={task}
            onOpen={onOpen}
            isDragging={draggingId === task.id}
            setDraggingId={setDraggingId}
            saveStatus={saveStatus[task.id]}
          />
        ))}
      </div>
    </div>
  );
}

function KanbanCard({ task, onOpen, isDragging, setDraggingId, saveStatus }) {
  const hasLinks = (task.links?.length || 0) > 0;
  const done = task.estado === "Terminado";
  const arch = !!task.archivada;
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        setDraggingId(task.id);
      }}
      onDragEnd={() => setDraggingId(null)}
      onClick={() => onOpen(task.id)}
      className={`kanban-card ${isDragging ? "dragging" : ""} ${arch ? "archived" : ""}`}
    >
      <div className="kanban-card-top">
        <PrioridadDot prioridad={task.prioridad} />
        <div className="kanban-card-top-right">
          {arch && <Archive size={9} className="archive-mini-icon"/>}
          <SaveDot status={saveStatus} />
        </div>
      </div>
      <h4 className="kanban-card-title">{task.actividad}</h4>
      <div className="kanban-card-bottom">
        <span>{done && task.fechaTerminado ? `✓ ${fechaTerminadoCorta(task.fechaTerminado)}` : fechaCorta(task)}</span>
        {!done && <DeadlineBadge task={task} compact />}
        {hasLinks && <span className="link-icon"><Link2 size={10}/>{task.links.length}</span>}
      </div>
    </article>
  );
}

// ===================================================================
// VISTA: PROYECTOS
// ===================================================================
function ProjectsView({ projectsList, expandedProjectRows, toggleProjectRow, setSelectedTaskId, colorOverrides }) {
  if (projectsList.length === 0) {
    return <div className="yo-card p-8 text-center text-sm text-stone-400">Sin proyectos con los filtros actuales.</div>;
  }
  return (
    <div className="projects-view">
      {projectsList.map(p => (
        <ProjectRow
          key={p.key}
          project={p}
          expanded={!!expandedProjectRows[p.key]}
          onToggle={() => toggleProjectRow(p.key)}
          setSelectedTaskId={setSelectedTaskId}
          colorOverrides={colorOverrides}
        />
      ))}
    </div>
  );
}

function ProjectRow({ project, expanded, onToggle, setSelectedTaskId, colorOverrides }) {
  const Icon = iconForProject(project.proyecto);
  const { metrics } = project;
  return (
    <div className={`proj-row proj-risk-${metrics.risk} ${expanded ? "expanded" : ""}`}>
      <button className="proj-row-head" onClick={onToggle}>
        <div className="proj-row-mark">
          <span className={`risk-dot risk-dot-${metrics.risk}`} />
          <Icon size={14} />
        </div>
        <div className="proj-row-id">
          <div className="proj-row-name">{project.proyecto}</div>
          <div className="proj-row-meta">{project.empresa}</div>
        </div>
        <div className="proj-row-pipeline">
          {ESTADOS.map(s => {
            const cnt = project.tasks.filter(t => t.estado === s).length;
            return (
              <div key={s} className={`pipe pipe-${s.replace(/\s+/g, "-").toLowerCase()}`} title={`${s}: ${cnt}`}>
                <span className="pipe-n">{cnt}</span>
                <span className="pipe-l">{s.slice(0, 3)}</span>
              </div>
            );
          })}
        </div>
        <div className="proj-row-team">
          {project.asignados.slice(0, 5).map(name => (
            <PersonaAvatar key={name} name={name} size={22} colorOverrides={colorOverrides} />
          ))}
          {project.asignados.length > 5 && <span className="team-more">+{project.asignados.length - 5}</span>}
        </div>
        <div className="proj-row-progress">
          <ProgressBar pct={metrics.pct} risk={metrics.risk} />
          <div className="proj-row-pct">{metrics.pct}%</div>
        </div>
        <div className="proj-row-chev">
          {expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
        </div>
      </button>
      {expanded && (
        <div className="proj-row-body">
          {project.tasks
            .sort((a, b) => urgencyScore(a) - urgencyScore(b))
            .map(t => (
              <TaskListRow key={t.id} task={t} onOpen={() => setSelectedTaskId(t.id)} colorOverrides={colorOverrides} />
            ))}
        </div>
      )}
    </div>
  );
}

function TaskListRow({ task, onOpen, colorOverrides }) {
  const done = task.estado === "Terminado";
  const palette = personPalette(task.responsable, colorOverrides);
  return (
    <button onClick={onOpen} className={`task-row ${task.archivada ? "archived" : ""}`}>
      <EstadoChip estado={task.estado} mini />
      <div className="task-row-title">
        {task.actividad}
        {task.archivada && <Archive size={10} className="task-row-arch"/>}
      </div>
      <div className="task-row-asg">
        <PersonaAvatar name={task.responsable} size={18} colorOverrides={colorOverrides} />
        <span style={{ color: palette.text }}>{(task.responsable || "").split(" ")[0]}</span>
      </div>
      <div className="task-row-date">
        {done && task.fechaTerminado ? `✓ ${fechaTerminadoCorta(task.fechaTerminado)}` : fechaCorta(task)}
      </div>
      <div className="task-row-due">
        {!done && <DeadlineBadge task={task} compact />}
      </div>
    </button>
  );
}

// ===================================================================
// VISTA: ESTADOS (kanban horizontal compacto)
// ===================================================================
function EstadosView({ tasks, setSelectedTaskId, changeStatusByDrag, draggingId, setDraggingId, saveStatus, colorOverrides }) {
  return (
    <div className="estados-view">
      {ESTADOS.map(s => {
        const colTasks = tasks.filter(t => t.estado === s).sort((a, b) => urgencyScore(a) - urgencyScore(b));
        const [over, setOver] = [false, () => {}];
        return (
          <EstadoColumn
            key={s}
            estado={s}
            tasks={colTasks}
            onDrop={(taskId) => changeStatusByDrag(taskId, s)}
            onOpen={setSelectedTaskId}
            draggingId={draggingId}
            setDraggingId={setDraggingId}
            saveStatus={saveStatus}
            colorOverrides={colorOverrides}
          />
        );
      })}
    </div>
  );
}

function EstadoColumn({ estado, tasks, onDrop, onOpen, draggingId, setDraggingId, saveStatus, colorOverrides }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`estado-col estado-col-${estado.replace(/\s+/g, "-").toLowerCase()} ${over ? "over" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        setOver(false);
        if (id) onDrop(id);
      }}
    >
      <div className="estado-col-header">
        <span>{estado}</span>
        <span className="estado-col-count">{tasks.length}</span>
      </div>
      <div className="estado-col-body">
        {tasks.length === 0 && <div className="kanban-empty">—</div>}
        {tasks.map(task => (
          <EstadoCard
            key={task.id}
            task={task}
            onOpen={onOpen}
            isDragging={draggingId === task.id}
            setDraggingId={setDraggingId}
            saveStatus={saveStatus[task.id]}
            colorOverrides={colorOverrides}
          />
        ))}
      </div>
    </div>
  );
}

function EstadoCard({ task, onOpen, isDragging, setDraggingId, saveStatus, colorOverrides }) {
  const palette = personPalette(task.responsable, colorOverrides);
  const done = task.estado === "Terminado";
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        setDraggingId(task.id);
      }}
      onDragEnd={() => setDraggingId(null)}
      onClick={() => onOpen(task.id)}
      className={`estado-card ${isDragging ? "dragging" : ""} ${task.archivada ? "archived" : ""}`}
      style={{ borderLeftColor: palette.main }}
    >
      <div className="estado-card-top">
        <span className="estado-card-proj">{task.proyecto}</span>
        <PrioridadDot prioridad={task.prioridad} />
      </div>
      <h4 className="estado-card-title">{task.actividad}</h4>
      <div className="estado-card-bottom">
        <div className="estado-card-asg">
          <PersonaAvatar name={task.responsable} size={16} colorOverrides={colorOverrides} />
          <span style={{ color: palette.text }}>{(task.responsable || "").split(" ")[0]}</span>
        </div>
        <div className="estado-card-right">
          {done && task.fechaTerminado
            ? <span className="estado-card-date">✓ {fechaTerminadoCorta(task.fechaTerminado)}</span>
            : (!done && <DeadlineBadge task={task} compact />)
          }
          {task.archivada && <Archive size={9} className="archive-mini-icon"/>}
        </div>
      </div>
    </article>
  );
}

// ===================================================================
// PANEL DE AJUSTES (colores por persona)
// ===================================================================
function SettingsPanel({ personas, colorOverrides, onChangeColor, onClose }) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-box" onClick={e => e.stopPropagation()}>
        <header className="settings-header">
          <div>
            <p className="yo-eyebrow">Ajustes</p>
            <h3 className="settings-title">Colores por responsable</h3>
            <p className="settings-sub">Estos colores se guardan en el Sheet y los ve todo el equipo.</p>
          </div>
          <button onClick={onClose} className="btn-ghost"><X size={14}/></button>
        </header>
        <div className="settings-body">
          {personas.length === 0 ? (
            <p className="text-sm text-stone-500 p-4 text-center">Aún no hay personas con tareas asignadas.</p>
          ) : (
            personas.map(name => (
              <PersonaColorRow
                key={name}
                name={name}
                currentColor={colorOverrides[name] || PALETTE_DEFAULTS[hashName(name) % PALETTE_DEFAULTS.length]}
                isCustom={!!colorOverrides[name]}
                onChange={(color) => onChangeColor(name, color)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PersonaColorRow({ name, currentColor, isCustom, onChange }) {
  const palette = { main: currentColor, soft: softVariant(currentColor), text: darkVariant(currentColor) };
  return (
    <div className="persona-color-row">
      <div className="pcr-id">
        <div className="pcr-avatar" style={{ background: palette.main }}>{getInitials(name)}</div>
        <div>
          <div className="pcr-name">{name}</div>
          <div className="pcr-sub">{isCustom ? "Personalizado" : "Automático"} · {currentColor}</div>
        </div>
      </div>
      <div className="pcr-swatches">
        {COLOR_PICKER_SWATCHES.map(c => (
          <button
            key={c}
            className={`swatch ${c === currentColor ? "on" : ""}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            title={c}
          />
        ))}
        <input
          type="color"
          value={currentColor}
          onChange={e => onChange(e.target.value)}
          className="swatch-custom"
          title="Color personalizado"
        />
      </div>
    </div>
  );
}

// ===================================================================
// MODO PRESENTACIÓN
// ===================================================================
function PresentationMode({ tasks, weekStats, riskyProjects, colorOverrides, onClose }) {
  const [slide, setSlide] = useState(0);
  const slides = [
    { title: "Board operativo", subtitle: "Aurum Arquitectos · YoDesarrollo", kind: "cover" },
    { title: "Esta semana", subtitle: "Movimientos relevantes", kind: "stats" },
    { title: "Proyectos en riesgo", subtitle: "Atención inmediata", kind: "risks" },
    { title: "Próximas entregas", subtitle: "Vencen en los próximos 7 días", kind: "upcoming" },
    { title: "Actividad reciente", subtitle: "Última semana", kind: "activity" },
  ];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") setSlide(s => Math.min(slides.length - 1, s + 1));
      if (e.key === "ArrowLeft") setSlide(s => Math.max(0, s - 1));
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length, onClose]);

  const cur = slides[slide];

  return (
    <div className="present-overlay">
      <button className="present-close" onClick={onClose}><X size={14}/> Salir</button>
      <div className="present-stage">
        <p className="present-eyebrow">Aurum · YoDesarrollo</p>
        <h2 className="present-title">{cur.title}</h2>
        <p className="present-sub">{cur.subtitle}</p>
        <div className="present-body">
          {cur.kind === "cover" && <PresentCover stats={weekStats} risky={riskyProjects.length} />}
          {cur.kind === "stats" && <PresentStats stats={weekStats} />}
          {cur.kind === "risks" && <PresentRisks risky={riskyProjects} />}
          {cur.kind === "upcoming" && <PresentUpcoming tasks={tasks} colorOverrides={colorOverrides} />}
          {cur.kind === "activity" && <PresentActivity tasks={tasks} colorOverrides={colorOverrides} />}
        </div>
      </div>
      <div className="present-nav">
        <button onClick={() => setSlide(s => Math.max(0, s - 1))} disabled={slide === 0}><ChevronLeft size={14}/> Anterior</button>
        <span className="present-counter">{slide + 1} / {slides.length}</span>
        <button onClick={() => setSlide(s => Math.min(slides.length - 1, s + 1))} disabled={slide === slides.length - 1}>Siguiente <ChevronRight size={14}/></button>
      </div>
    </div>
  );
}

function PresentCover({ stats, risky }) {
  return (
    <div className="present-cover">
      <div className="cover-big-stat">
        <div className="cbs-n">{stats.terminadasSemana}</div>
        <div className="cbs-l">tareas terminadas esta semana</div>
      </div>
      <div className="cover-mini-stats">
        <div className="cms"><span className="cms-n">{stats.vencenSemana}</span><span className="cms-l">vencen 7d</span></div>
        <div className="cms"><span className="cms-n">{risky}</span><span className="cms-l">proyectos en riesgo</span></div>
      </div>
    </div>
  );
}

function PresentStats({ stats }) {
  return (
    <div className="present-stats">
      <div className="ps-card"><div className="ps-n">{stats.terminadasSemana}</div><div className="ps-l">Terminadas</div></div>
      <div className="ps-card"><div className="ps-n">{stats.subidasSemana}</div><div className="ps-l">Subidas a revisión</div></div>
      <div className="ps-card"><div className="ps-n">{stats.vencenSemana}</div><div className="ps-l">Vencen en 7 días</div></div>
    </div>
  );
}

function PresentRisks({ risky }) {
  if (risky.length === 0) {
    return <div className="present-empty">✓ Sin proyectos en riesgo.</div>;
  }
  return (
    <div className="present-risks">
      {risky.slice(0, 6).map(p => (
        <div key={p.key} className={`pr-card risk-${p.metrics.risk}`}>
          <div className="pr-head">
            <span className="pr-name">{p.proyecto}</span>
            <span className="pr-pct">{p.metrics.pct}%</span>
          </div>
          <div className="pr-meta">{p.empresa} · {p.metrics.overdue} atrasadas · {p.metrics.openTotal} abiertas</div>
          <ProgressBar pct={p.metrics.pct} risk={p.metrics.risk} />
        </div>
      ))}
    </div>
  );
}

function PresentUpcoming({ tasks, colorOverrides }) {
  const upcoming = tasks
    .filter(t => {
      if (t.estado === "Terminado") return false;
      if (t.archivada) return false;
      const d = daysUntil(t);
      return d != null && d >= 0 && d <= 7;
    })
    .sort((a, b) => daysUntil(a) - daysUntil(b))
    .slice(0, 8);

  if (upcoming.length === 0) return <div className="present-empty">Sin entregas próximas.</div>;
  return (
    <div className="present-list">
      {upcoming.map(t => {
        const palette = personPalette(t.responsable, colorOverrides);
        return (
          <div key={t.id} className="pl-row">
            <div className="pl-due"><DeadlineBadge task={t} compact /></div>
            <div className="pl-title">{t.actividad}</div>
            <div className="pl-proj">{t.proyecto}</div>
            <div className="pl-asg" style={{ color: palette.text }}>
              <PersonaAvatar name={t.responsable} size={20} colorOverrides={colorOverrides} />
              {(t.responsable || "").split(" ")[0]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PresentActivity({ tasks, colorOverrides }) {
  const today = new Date();
  const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
  const recent = tasks
    .filter(t => {
      const ref = t.fechaTerminado || t.actualizado;
      return ref && new Date(ref) >= weekAgo && (t.estado === "Terminado" || t.estado === "Subido");
    })
    .sort((a, b) => new Date(b.fechaTerminado || b.actualizado) - new Date(a.fechaTerminado || a.actualizado))
    .slice(0, 8);

  if (recent.length === 0) return <div className="present-empty">Sin actividad reciente.</div>;
  return (
    <div className="present-list">
      {recent.map(t => {
        const palette = personPalette(t.responsable, colorOverrides);
        const verb = t.estado === "Terminado" ? "completó" : "subió a revisión";
        return (
          <div key={t.id} className="pl-row">
            <div className="pl-asg" style={{ color: palette.text }}>
              <PersonaAvatar name={t.responsable} size={20} colorOverrides={colorOverrides} />
              {(t.responsable || "").split(" ")[0]}
            </div>
            <div className="pl-verb">{verb}</div>
            <div className="pl-title">{t.actividad}</div>
            <div className="pl-proj">{t.proyecto}</div>
          </div>
        );
      })}
    </div>
  );
}

// ===================================================================
// SUBCOMPONENTES COMUNES
// ===================================================================
function CompanyLogos() {
  return (
    <div className="flex items-center gap-2">
      <CompanyLogo name="Aurum Arquitectos" size={32} />
      <CompanyLogo name="YoDesarrollo" size={32} />
    </div>
  );
}

function CompanyLogo({ name, size = 24 }) {
  const url = ASSETS.logos[name];
  if (url) return <img src={url} alt={name} style={{ height: size, width: "auto", objectFit: "contain" }} />;
  return (
    <div className="logo-placeholder" style={{ width: size, height: size, fontSize: size * 0.4 }} title={name}>
      {getInitials(name)}
    </div>
  );
}

function PersonaAvatar({ name, size = 40, colorOverrides }) {
  const palette = personPalette(name, colorOverrides);
  return (
    <div className="persona-avatar-placeholder" style={{ width: size, height: size, background: palette.main, fontSize: size * 0.35 }}>
      {getInitials(name)}
    </div>
  );
}

function PrioridadDot({ prioridad }) {
  if (!prioridad) return null;
  const cls = `pri-dot pri-${prioridad.toLowerCase()}`;
  return <span className={cls} title={`Prioridad ${prioridad}`}></span>;
}

function PrioridadChip({ prioridad }) {
  if (!prioridad) return null;
  return <span className={`pri-chip pri-chip-${prioridad.toLowerCase()}`}>{prioridad}</span>;
}

function EstadoChip({ estado, mini }) {
  return <span className={`est-chip ${mini ? "mini" : ""} est-${estado.replace(/\s+/g, "-").toLowerCase()}`}>{estado}</span>;
}

function DeadlineBadge({ task, compact = false }) {
  const d = daysUntil(task);
  const tone = d == null ? "deadline-gray" : d < 0 ? "deadline-red" : d <= 2 ? "deadline-orange" : "deadline-green";
  const label = d == null ? "—" : d === 0 ? "Hoy" : d > 0 ? `+${d}` : `${d}`;
  return <span className={`deadline-badge ${compact ? "deadline-c" : ""} ${tone}`}>{label}</span>;
}

function SaveDot({ status }) {
  if (!status || status === "idle") return null;
  if (status === "saving") return <span className="save-dot save-saving"><Clock size={9}/></span>;
  if (status === "saved")  return <span className="save-dot save-saved"><CheckCircle2 size={9}/></span>;
  if (status === "error")  return <span className="save-dot save-error"><AlertCircle size={9}/></span>;
  return null;
}

function SaveBadge({ status, errorMsg, onRetry }) {
  if (status === "saving") return <span className="badge-saving"><Clock size={12}/>Guardando…</span>;
  if (status === "saved") return <span className="badge-saved"><CheckCircle2 size={12}/>Guardado</span>;
  if (status === "error") return <button onClick={onRetry} className="badge-error" title={errorMsg || ""}><AlertCircle size={12}/>Error · reintentar</button>;
  return <span className="badge-idle">Listo</span>;
}

function GlobalSyncBadge({ status }) {
  return <span className={`g-sync g-sync-${status.type}`}>{status.text}</span>;
}

function Metric({ label, value, tone }) {
  const cls = `metric-card${tone ? ` metric-${tone}` : ""}`;
  return (
    <div className={cls}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function ConfirmModal({ dialog }) {
  if (!dialog?.open) return null;
  return (
    <div className="confirm-overlay" onClick={dialog.onCancel}>
      <div className="confirm-box" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon"><AlertCircle size={36} /></div>
        <h3 className="confirm-title">{dialog.title}</h3>
        <p className="confirm-msg">{dialog.message}</p>
        <div className="confirm-actions">
          <button onClick={dialog.onCancel} className="confirm-cancel">Cancelar</button>
          <button onClick={dialog.onConfirm} className={dialog.danger ? "confirm-danger" : "confirm-primary"}>{dialog.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// ESTILOS
// ===================================================================
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;900&family=Montserrat:wght@300;400;500;600;700;800&display=swap');

      .yo-theme { font-family: 'Montserrat', system-ui, -apple-system, sans-serif; color: #1a1a1a; -webkit-font-smoothing: antialiased; }
      .yo-display { font-family: 'Playfair Display', Georgia, serif; font-weight: 700; letter-spacing: -0.01em; line-height: 1.15; }
      .yo-eyebrow { font-family: 'Montserrat', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #888; }
      .brand-shell { background: linear-gradient(180deg, #FFFFFF 0%, #F7F4EF 100%); }

      .yo-btn-primary { display: inline-flex; align-items: center; gap: 0.4rem; background: #000; color: #fff; padding: 0.5rem 0.9rem; font-size: 0.78rem; font-weight: 600; transition: background 0.15s; }
      .yo-btn-primary:hover { background: #333; }
      .yo-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .yo-btn-secondary { display: inline-flex; align-items: center; gap: 0.4rem; background: #fff; color: #1a1a1a; padding: 0.5rem 0.7rem; font-size: 0.78rem; font-weight: 600; border: 1px solid #ddd; transition: background 0.15s; }
      .yo-btn-secondary:hover { background: #F3F3F3; }
      .yo-btn-danger { display: inline-flex; align-items: center; gap: 0.4rem; background: #fff; color: #b91c1c; padding: 0.5rem 0.9rem; font-size: 0.78rem; font-weight: 600; border: 1px solid #fca5a5; }
      .yo-btn-danger:hover { background: #fef2f2; }
      .btn-ghost { padding: 0.4rem 0.7rem; font-size: 0.78rem; font-weight: 600; color: #555; }
      .btn-ghost:hover { color: #000; background: #F3F3F3; }
      .yo-success { color: #15803d; font-weight: 600; }
      .yo-card { background: #FFFFFF; border: 1px solid #ECECEC; }
      .yo-header { background: #FFFFFF; border: 1px solid #ECECEC; padding: 0.85rem 1rem; }

      .input { width: 100%; border: 1px solid #DDD; background: #FFF; padding: 0.5rem 0.65rem; font-size: 0.82rem; font-family: 'Montserrat', sans-serif; outline: none; }
      .input:focus { border-color: #000; }
      textarea.input { resize: vertical; min-height: 60px; }
      .field { display: block; }
      .field-label { display: block; font-size: 9px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #888; margin-bottom: 0.3rem; }

      .diagnostic-banner { display: flex; gap: 0.7rem; align-items: flex-start; background: #FEF3C7; border-left: 4px solid #F59E0B; color: #92400E; padding: 0.85rem 1rem; font-size: 0.8rem; }

      .logo-placeholder { display: grid; place-items: center; background: linear-gradient(135deg, #1a1a1a 0%, #555 100%); color: #fff; font-weight: 800; letter-spacing: -0.04em; }
      .persona-avatar-placeholder { display: grid; place-items: center; border-radius: 50%; color: #fff; font-weight: 800; letter-spacing: -0.04em; }

      /* ============ VIEW SELECTOR ============ */
      .view-selector { display: inline-flex; border: 1px solid #ddd; background: #fff; }
      .vs-btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.5rem 0.7rem; font-size: 0.72rem; font-weight: 600; color: #555; background: transparent; border-right: 1px solid #ddd; }
      .vs-btn:last-child { border-right: 0; }
      .vs-btn:hover { background: #F3F3F3; }
      .vs-btn.on { background: #1a1a1a; color: #fff; }

      /* ============ ARCHIVE TOGGLE ============ */
      .archive-toggle {
        display: inline-flex; align-items: center; gap: 0.35rem;
        padding: 0.45rem 0.7rem; font-size: 0.72rem; font-weight: 600;
        border: 1px solid #ddd; background: #fff; cursor: pointer;
      }
      .archive-toggle input { width: 12px; height: 12px; cursor: pointer; }
      .archive-toggle:hover { background: #F3F3F3; }
      .archive-toggle-cnt {
        background: #1a1a1a; color: #fff;
        padding: 0.05rem 0.3rem; font-size: 0.62rem; font-weight: 700;
        margin-left: 0.2rem;
      }

      /* ============ BRIEFING SEMANAL ============ */
      .brief {
        display: flex; gap: 1rem; align-items: stretch;
        background: #FFF; border: 1px solid #ECECEC;
        padding: 0.85rem 1rem; margin-bottom: 0.75rem;
      }
      .brief-col { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
      .brief-col-stats { flex: 0 0 auto; }
      .brief-col-risks { flex: 1; min-width: 0; }
      .brief-divider { width: 1px; background: #ECECEC; }
      .brief-lbl {
        font-size: 9px; font-weight: 700; letter-spacing: 0.18em;
        text-transform: uppercase; color: #888;
        display: flex; align-items: center; gap: 0.4rem;
      }
      .brief-lbl-cnt {
        background: #1a1a1a; color: #fff;
        padding: 0.05rem 0.35rem; font-size: 0.6rem;
      }
      .brief-stats { display: flex; gap: 0.85rem; }
      .brief-stat { min-width: 60px; }
      .brief-stat-n {
        font-family: 'Playfair Display', serif;
        font-size: 1.8rem; font-weight: 700; line-height: 1;
      }
      .brief-stat-l {
        font-size: 10px; font-weight: 700;
        letter-spacing: 0.14em; text-transform: uppercase;
        color: #888; margin-top: 0.1rem;
      }
      .brief-empty {
        font-size: 0.8rem; color: #15803d; font-weight: 600;
      }
      .risk-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 0.5rem;
      }
      .risk-card {
        background: #FAFAFA; border: 1px solid #E5E5E5;
        padding: 0.55rem 0.7rem; text-align: left; cursor: pointer;
        transition: border-color 0.12s, transform 0.12s;
      }
      .risk-card:hover { border-color: #1a1a1a; transform: translateY(-1px); }
      .risk-card.risk-critico { border-left: 3px solid #DC2626; background: #FEF2F2; }
      .risk-card.risk-riesgo  { border-left: 3px solid #F59E0B; background: #FEF8E7; }
      .risk-head {
        display: flex; justify-content: space-between; align-items: baseline;
        gap: 0.4rem; margin-bottom: 0.2rem;
      }
      .risk-name {
        font-size: 0.78rem; font-weight: 700; color: #1a1a1a;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .risk-pct { font-size: 0.7rem; font-weight: 700; color: #555; }
      .risk-meta {
        font-size: 0.66rem; color: #777; margin-bottom: 0.35rem;
        display: flex; gap: 0.3rem; align-items: center;
      }
      .risk-meta .dot { color: #BBB; }
      .progress {
        position: relative; height: 4px; background: #E5E5E5; overflow: hidden;
      }
      .progress-fill { height: 100%; background: #1a1a1a; transition: width 0.3s; }
      .progress-ok .progress-fill       { background: #10B981; }
      .progress-atencion .progress-fill { background: #3B82F6; }
      .progress-riesgo .progress-fill   { background: #F59E0B; }
      .progress-critico .progress-fill  { background: #DC2626; }

      /* ============ VISTA PERSONAS (igual que antes) ============ */
      .personas-columns {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 0.6rem;
        align-items: start;
      }
      @media (max-width: 1280px) { .personas-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 640px)  { .personas-columns { grid-template-columns: 1fr; } }

      .persona-column { background: #FFF; border: 1px solid #ECECEC; border-top: 4px solid #1a1a1a; display: flex; flex-direction: column; min-width: 0; }
      .persona-column-header { display: flex; align-items: center; gap: 0.55rem; padding: 0.7rem 0.8rem; border-bottom: 1px solid #ECECEC; }
      .persona-column-info { flex: 1; min-width: 0; }
      .persona-column-name { font-family: 'Playfair Display', serif; font-size: 1.05rem; font-weight: 700; margin: 0; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .persona-column-meta { font-size: 0.68rem; color: #777; margin-top: 0.25rem; display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap; }
      .persona-column-body { padding: 0.55rem 0.65rem 0.75rem; display: flex; flex-direction: column; gap: 0.7rem; }
      .urgent-pill { display: inline-flex; align-items: center; gap: 0.15rem; background: #FEE2E2; color: #991B1B; padding: 0.05rem 0.35rem; font-weight: 700; font-size: 0.62rem; }

      .empresa-block { display: flex; flex-direction: column; }
      .empresa-header-mini { display: flex; align-items: center; gap: 0.3rem; padding-bottom: 0.3rem; margin-bottom: 0.35rem; border-bottom: 1px solid #ECECEC; }
      .empresa-name-mini { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #555; }

      .proyectos-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.3rem; grid-auto-flow: row dense; }
      .proyecto-tile { background: #FFF; border: 1px solid #E5E5E5; min-width: 0; transition: border-color 0.12s, transform 0.12s, opacity 0.12s; position: relative; }
      .proyecto-tile:hover { border-color: #999; }
      .proyecto-tile.expanded { grid-column: 1 / -1; border-color: #1a1a1a; }
      .proyecto-tile.tile-dragging { opacity: 0.35; }
      .proyecto-tile.tile-drop-over::before { content: ""; position: absolute; inset: -2px; border: 2px dashed #1a1a1a; pointer-events: none; background: rgba(26,26,26,0.04); }
      .drag-handle { cursor: grab; color: #BBB; padding: 0 0.2rem; display: inline-flex; align-items: center; flex-shrink: 0; }
      .drag-handle:hover { color: #555; }
      .drag-handle:active { cursor: grabbing; }
      .proyecto-tile-button { width: 100%; padding: 0.4rem 0.45rem; cursor: pointer; text-align: left; background: transparent; display: flex; flex-direction: column; gap: 0.3rem; }
      .proyecto-tile-top { display: flex; align-items: center; gap: 0.25rem; min-width: 0; }
      .proyecto-tile-name { font-size: 0.68rem; font-weight: 700; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; line-height: 1.15; }
      .alta-mini { display: inline-flex; align-items: center; gap: 0.1rem; background: #FEE2E2; color: #991B1B; padding: 0.05rem 0.25rem; font-size: 0.58rem; font-weight: 700; flex-shrink: 0; }
      .proyecto-tile-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; font-size: 0.6rem; font-weight: 700; }
      .proyecto-tile-stats span { text-align: center; padding: 0.08rem 0; line-height: 1.1; }
      .stat-pen { background: #F1F5F9; color: #475569; }
      .stat-proc { background: #FEF3C7; color: #92400E; }
      .stat-sub { background: #DBEAFE; color: #1E40AF; }
      .stat-term { background: #D1FAE5; color: #065F46; }

      .proyecto-tile-kanban { border-top: 1px solid #ECECEC; background: #FAFAFA; padding: 0.45rem; }
      .kanban-vertical { display: flex; flex-direction: column; gap: 0.4rem; }
      .kanban-vertical .kanban-col { background: #FFF; border: 1px solid #E5E5E5; min-height: 50px; transition: all 0.15s; }
      .kanban-vertical .kanban-col.over { border-color: #000; background: #F3F3F3; }
      .kanban-vertical .kanban-col-header { display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0.55rem; border-bottom: 1px solid #ECECEC; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
      .kanban-vertical .kanban-col-pendiente .kanban-col-header { background: #F1F5F9; color: #475569; border-bottom-color: #CBD5E1; }
      .kanban-vertical .kanban-col-en-proceso .kanban-col-header { background: #FEF3C7; color: #92400E; border-bottom-color: #FCD34D; }
      .kanban-vertical .kanban-col-subido .kanban-col-header { background: #DBEAFE; color: #1E40AF; border-bottom-color: #93C5FD; }
      .kanban-vertical .kanban-col-terminado .kanban-col-header { background: #D1FAE5; color: #065F46; border-bottom-color: #6EE7B7; }
      .kanban-vertical .kanban-count { background: rgba(0,0,0,0.08); padding: 0.05rem 0.35rem; min-width: 18px; text-align: center; font-size: 0.6rem; }
      .kanban-vertical .kanban-col-body { padding: 0.35rem; }
      .kanban-vertical .kanban-empty { font-size: 0.65rem; color: #BBB; text-align: center; padding: 0.4rem 0; }
      .kanban-vertical .kanban-card { background: #FFF; border: 1px solid #E5E5E5; padding: 0.4rem 0.45rem; margin-bottom: 0.3rem; cursor: grab; transition: all 0.12s; }
      .kanban-vertical .kanban-card.archived { background: #FAFAFA; opacity: 0.55; border-style: dashed; }
      .kanban-vertical .kanban-card:last-child { margin-bottom: 0; }
      .kanban-vertical .kanban-card:hover { border-color: #1a1a1a; transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,0.06); }
      .kanban-vertical .kanban-card:active { cursor: grabbing; }
      .kanban-vertical .kanban-card.dragging { opacity: 0.4; }
      .kanban-vertical .kanban-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.25rem; }
      .kanban-vertical .kanban-card-top-right { display: flex; align-items: center; gap: 0.2rem; }
      .archive-mini-icon { color: #777; }
      .kanban-vertical .kanban-card-title { font-size: 0.72rem; font-weight: 700; color: #1a1a1a; line-height: 1.2; margin: 0 0 0.3rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .kanban-vertical .kanban-card-bottom { display: flex; justify-content: space-between; align-items: center; gap: 0.25rem; font-size: 0.6rem; color: #888; font-weight: 600; flex-wrap: wrap; }

      /* ============ VISTA PROYECTOS ============ */
      .projects-view { display: flex; flex-direction: column; gap: 0.4rem; }
      .proj-row { background: #FFF; border: 1px solid #ECECEC; }
      .proj-row.proj-risk-critico { border-left: 4px solid #DC2626; }
      .proj-row.proj-risk-riesgo  { border-left: 4px solid #F59E0B; }
      .proj-row.proj-risk-atencion{ border-left: 4px solid #3B82F6; }
      .proj-row.proj-risk-ok      { border-left: 4px solid #10B981; }
      .proj-row.expanded { border-color: #1a1a1a; }
      .proj-row-head {
        display: grid;
        grid-template-columns: 40px 1fr 200px 140px 200px 24px;
        gap: 0.6rem;
        align-items: center;
        padding: 0.55rem 0.8rem;
        width: 100%;
        background: transparent;
        cursor: pointer;
        text-align: left;
      }
      .proj-row-head:hover { background: #FAFAFA; }
      .proj-row-mark { display: flex; align-items: center; gap: 0.4rem; }
      .risk-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
      .risk-dot-critico { background: #DC2626; }
      .risk-dot-riesgo  { background: #F59E0B; }
      .risk-dot-atencion{ background: #3B82F6; }
      .risk-dot-ok      { background: #10B981; }
      .proj-row-id { min-width: 0; }
      .proj-row-name { font-size: 0.88rem; font-weight: 700; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .proj-row-meta { font-size: 0.7rem; color: #777; }
      .proj-row-pipeline { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; }
      .pipe { display: flex; flex-direction: column; align-items: center; padding: 0.2rem 0.1rem; font-size: 0.58rem; font-weight: 700; line-height: 1.1; }
      .pipe-n { font-size: 0.85rem; font-weight: 800; }
      .pipe-l { letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.7; }
      .pipe-pendiente { background: #F1F5F9; color: #475569; }
      .pipe-en-proceso { background: #FEF3C7; color: #92400E; }
      .pipe-subido { background: #DBEAFE; color: #1E40AF; }
      .pipe-terminado { background: #D1FAE5; color: #065F46; }
      .proj-row-team { display: flex; gap: -4px; align-items: center; }
      .proj-row-team > * { margin-left: -4px; border: 2px solid #FFF; }
      .proj-row-team > *:first-child { margin-left: 0; }
      .team-more { background: #E5E5E5; color: #555; border-radius: 50%; width: 22px; height: 22px; display: grid; place-items: center; font-size: 0.62rem; font-weight: 700; }
      .proj-row-progress { display: flex; flex-direction: column; gap: 0.2rem; }
      .proj-row-pct { font-size: 0.7rem; font-weight: 700; color: #555; text-align: right; }
      .proj-row-chev { color: #BBB; display: flex; justify-content: center; }
      .proj-row-body { border-top: 1px solid #ECECEC; padding: 0.4rem 0.8rem; background: #FAFAFA; display: flex; flex-direction: column; gap: 0.25rem; }
      .task-row { display: grid; grid-template-columns: 100px 1fr 140px 80px 40px; gap: 0.6rem; align-items: center; padding: 0.4rem 0.5rem; background: #FFF; border: 1px solid #ECECEC; cursor: pointer; text-align: left; }
      .task-row:hover { border-color: #1a1a1a; }
      .task-row.archived { background: #FAFAFA; opacity: 0.55; border-style: dashed; }
      .task-row-title { font-size: 0.78rem; font-weight: 600; color: #1a1a1a; display: flex; align-items: center; gap: 0.3rem; }
      .task-row-arch { color: #777; }
      .task-row-asg { display: flex; align-items: center; gap: 0.3rem; font-size: 0.7rem; font-weight: 600; }
      .task-row-date { font-size: 0.7rem; color: #777; }
      .task-row-due { display: flex; justify-content: flex-end; }

      @media (max-width: 1024px) {
        .proj-row-head { grid-template-columns: 30px 1fr 80px; gap: 0.4rem; }
        .proj-row-pipeline, .proj-row-team, .proj-row-progress, .proj-row-chev { display: none; }
        .task-row { grid-template-columns: 90px 1fr 90px; }
        .task-row-date, .task-row-due { display: none; }
      }

      /* ============ VISTA ESTADOS ============ */
      .estados-view { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.5rem; align-items: start; }
      @media (max-width: 1024px) { .estados-view { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 640px)  { .estados-view { grid-template-columns: 1fr; } }
      .estado-col { background: #FFF; border: 1px solid #ECECEC; transition: all 0.15s; min-height: 80px; }
      .estado-col.over { border-color: #000; background: #F3F3F3; }
      .estado-col-pendiente { border-top: 3px solid #94A3B8; }
      .estado-col-en-proceso { border-top: 3px solid #F59E0B; }
      .estado-col-subido { border-top: 3px solid #3B82F6; }
      .estado-col-terminado { border-top: 3px solid #10B981; }
      .estado-col-header { display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.7rem; border-bottom: 1px solid #ECECEC; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
      .estado-col-count { background: rgba(0,0,0,0.08); padding: 0.1rem 0.4rem; font-size: 0.65rem; }
      .estado-col-body { padding: 0.45rem; display: flex; flex-direction: column; gap: 0.4rem; }
      .estado-card { background: #FFF; border: 1px solid #E5E5E5; border-left: 3px solid #1a1a1a; padding: 0.5rem 0.6rem; cursor: grab; transition: all 0.12s; }
      .estado-card:hover { box-shadow: 0 2px 6px rgba(0,0,0,0.06); transform: translateY(-1px); }
      .estado-card.dragging { opacity: 0.4; }
      .estado-card.archived { background: #FAFAFA; opacity: 0.55; border-style: dashed; }
      .estado-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem; }
      .estado-card-proj { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 75%; }
      .estado-card-title { font-size: 0.78rem; font-weight: 700; color: #1a1a1a; line-height: 1.25; margin: 0 0 0.4rem; }
      .estado-card-bottom { display: flex; justify-content: space-between; align-items: center; gap: 0.25rem; }
      .estado-card-asg { display: flex; align-items: center; gap: 0.3rem; font-size: 0.68rem; font-weight: 600; }
      .estado-card-right { display: flex; align-items: center; gap: 0.2rem; }
      .estado-card-date { font-size: 0.62rem; font-weight: 600; color: #065F46; }

      /* ============ TERMINADA / ARCHIVADA PILLS ============ */
      .terminada-pill { display: inline-flex; align-items: center; gap: 0.2rem; background: #D1FAE5; color: #065F46; padding: 0.15rem 0.5rem; font-size: 0.65rem; font-weight: 700; }
      .archivada-pill { display: inline-flex; align-items: center; gap: 0.2rem; background: #F3F3F3; color: #555; padding: 0.15rem 0.5rem; font-size: 0.65rem; font-weight: 700; }

      .archive-control { background: #FAFAFA; border: 1px solid #ECECEC; padding: 0.7rem 0.9rem; }
      .archive-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; font-weight: 600; color: #1a1a1a; cursor: pointer; }
      .archive-label input { width: 16px; height: 16px; cursor: pointer; }
      .archive-hint { font-size: 0.7rem; color: #777; margin: 0.3rem 0 0 1.7rem; }

      /* ============ AJUSTES (colores) ============ */
      .settings-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: grid; place-items: center; padding: 1rem; animation: fade 0.15s; }
      .settings-box { background: #FFF; max-width: 560px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 25px 60px rgba(0,0,0,0.25); }
      .settings-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.25rem 1.5rem; border-bottom: 1px solid #ECECEC; }
      .settings-title { font-family: 'Playfair Display', serif; font-size: 1.4rem; font-weight: 700; margin: 0.3rem 0 0.2rem; color: #1a1a1a; }
      .settings-sub { font-size: 0.78rem; color: #777; margin: 0; }
      .settings-body { padding: 0.5rem 0; overflow-y: auto; }
      .persona-color-row { display: flex; justify-content: space-between; align-items: center; gap: 0.8rem; padding: 0.7rem 1.5rem; border-bottom: 1px solid #F3F3F3; }
      .persona-color-row:last-child { border-bottom: 0; }
      .pcr-id { display: flex; align-items: center; gap: 0.6rem; min-width: 0; }
      .pcr-avatar { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; color: #FFF; font-weight: 800; font-size: 0.78rem; }
      .pcr-name { font-size: 0.88rem; font-weight: 700; color: #1a1a1a; }
      .pcr-sub { font-size: 0.68rem; color: #888; font-family: 'JetBrains Mono', ui-monospace, monospace; }
      .pcr-swatches { display: flex; flex-wrap: wrap; gap: 0.25rem; max-width: 280px; }
      .swatch { width: 20px; height: 20px; border: 2px solid #FFF; cursor: pointer; transition: transform 0.12s; outline: 1px solid #DDD; }
      .swatch:hover { transform: scale(1.15); }
      .swatch.on { outline: 2px solid #1a1a1a; outline-offset: 1px; }
      .swatch-custom { width: 28px; height: 24px; border: none; cursor: pointer; padding: 0; background: transparent; }

      /* Prioridad/Estado/Deadline */
      .pri-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; }
      .pri-alta { background: #DC2626; }
      .pri-media { background: #F59E0B; }
      .pri-baja { background: #94A3B8; }
      .pri-chip { display: inline-flex; align-items: center; padding: 0.15rem 0.5rem; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
      .pri-chip-alta { background: #FEE2E2; color: #991B1B; }
      .pri-chip-media { background: #FEF3C7; color: #92400E; }
      .pri-chip-baja { background: #F3F3F3; color: #555; }
      .est-chip { display: inline-flex; align-items: center; padding: 0.15rem 0.5rem; font-size: 0.65rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
      .est-chip.mini { padding: 0.08rem 0.35rem; font-size: 0.58rem; }
      .est-pendiente { background: #F3F3F3; color: #555; }
      .est-en-proceso { background: #FEF3C7; color: #92400E; }
      .est-subido { background: #DBEAFE; color: #1E40AF; }
      .est-terminado { background: #D1FAE5; color: #065F46; }
      .deadline-badge { display: inline-flex; align-items: center; padding: 0.1rem 0.35rem; font-size: 0.6rem; font-weight: 700; }
      .deadline-c { padding: 0.06rem 0.3rem; font-size: 0.58rem; }
      .deadline-red { background: #FEE2E2; color: #991B1B; }
      .deadline-orange { background: #FED7AA; color: #9A3412; }
      .deadline-green { background: #D1FAE5; color: #065F46; }
      .deadline-gray { background: #F3F3F3; color: #777; }

      .save-dot { display: inline-grid; place-items: center; width: 12px; height: 12px; }
      .save-saving { color: #92400E; animation: pulse 1s ease-in-out infinite; }
      .save-saved { color: #065F46; }
      .save-error { color: #991B1B; }
      @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
      .badge-saving, .badge-saved, .badge-error, .badge-idle { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.7rem; font-size: 0.72rem; font-weight: 700; }
      .badge-saving { background: #FEF3C7; color: #92400E; }
      .badge-saved { background: #D1FAE5; color: #065F46; }
      .badge-error { background: #FEE2E2; color: #991B1B; cursor: pointer; }
      .badge-idle { background: #F3F3F3; color: #555; }
      .g-sync { font-weight: 600; }
      .g-sync-saving { color: #92400E; }
      .g-sync-saved { color: #065F46; }
      .g-sync-error { color: #991B1B; }
      .g-sync-idle { color: #888; }

      .link-icon { display: inline-flex; align-items: center; gap: 0.15rem; background: #DBEAFE; color: #1E40AF; padding: 0.06rem 0.3rem; font-weight: 700; }
      .metric-card { background: #FFF; border: 1px solid #ECECEC; padding: 0.55rem 0.75rem; border-left-width: 4px; }
      .metric-card.metric-pendiente { border-left-color: #94A3B8; background: #F8FAFC; }
      .metric-card.metric-en-proceso { border-left-color: #F59E0B; background: #FEF8E7; }
      .metric-card.metric-subido { border-left-color: #3B82F6; background: #EFF4FF; }
      .metric-card.metric-terminado { border-left-color: #10B981; background: #ECFDF5; }
      .metric-value { font-family: 'Playfair Display', serif; font-size: 1.25rem; font-weight: 700; color: #1a1a1a; line-height: 1; }
      .metric-label { font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #888; margin-top: 0.15rem; }
      .form-derived { font-size: 0.72rem; color: #555; background: #F8F8F8; padding: 0.5rem 0.65rem; border-left: 3px solid #1a1a1a; }

      .confirm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 9999; display: grid; place-items: center; padding: 1rem; animation: fade 0.15s; }
      .confirm-box { background: #FFF; padding: 1.75rem; max-width: 420px; width: 100%; box-shadow: 0 25px 60px rgba(0,0,0,0.25); }
      .confirm-icon { display: grid; place-items: center; color: #DC2626; margin-bottom: 0.5rem; }
      .confirm-title { font-family: 'Playfair Display', serif; font-size: 1.3rem; font-weight: 700; text-align: center; color: #1a1a1a; margin: 0 0 0.5rem; }
      .confirm-msg { font-size: 0.85rem; color: #555; text-align: center; margin: 0 0 1.25rem; line-height: 1.5; }
      .confirm-actions { display: flex; gap: 0.5rem; justify-content: center; }
      .confirm-cancel, .confirm-danger, .confirm-primary { padding: 0.6rem 1.2rem; font-weight: 700; font-size: 0.8rem; }
      .confirm-cancel { background: #F3F3F3; color: #1a1a1a; }
      .confirm-cancel:hover { background: #E5E5E5; }
      .confirm-danger { background: #DC2626; color: #FFF; }
      .confirm-danger:hover { background: #991B1B; }
      .confirm-primary { background: #000; color: #FFF; }
      @keyframes fade { from { opacity: 0 } to { opacity: 1 } }

      /* ============ MODO PRESENTACIÓN ============ */
      .present-overlay { position: fixed; inset: 0; background: #0a0a0a; z-index: 10000; color: #FFF; display: flex; flex-direction: column; }
      .present-close { position: absolute; top: 1.5rem; right: 1.5rem; display: inline-flex; align-items: center; gap: 0.3rem; background: rgba(255,255,255,0.1); color: #FFF; padding: 0.5rem 0.9rem; font-size: 0.78rem; font-weight: 600; }
      .present-close:hover { background: rgba(255,255,255,0.2); }
      .present-stage { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 3rem 4rem; max-width: 1400px; margin: 0 auto; width: 100%; }
      .present-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; color: #999; margin: 0 0 1rem; }
      .present-title { font-family: 'Playfair Display', serif; font-size: 4rem; font-weight: 700; line-height: 1.05; margin: 0 0 0.5rem; color: #FFF; }
      .present-sub { font-size: 1.1rem; color: #BBB; margin: 0 0 3rem; }
      .present-body { flex: 0 1 auto; }
      .present-nav { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 2rem; border-top: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.5); }
      .present-nav button { display: inline-flex; align-items: center; gap: 0.4rem; background: transparent; color: #FFF; padding: 0.5rem 1rem; font-size: 0.85rem; font-weight: 600; }
      .present-nav button:disabled { opacity: 0.3; cursor: not-allowed; }
      .present-nav button:hover:not(:disabled) { background: rgba(255,255,255,0.1); }
      .present-counter { font-size: 0.78rem; font-weight: 600; color: #888; letter-spacing: 0.1em; }
      .present-empty { font-size: 1.2rem; color: #666; padding: 3rem 0; }

      .present-cover { display: flex; flex-direction: column; gap: 2rem; }
      .cover-big-stat .cbs-n { font-family: 'Playfair Display', serif; font-size: 8rem; font-weight: 700; line-height: 1; color: #FFF; }
      .cover-big-stat .cbs-l { font-size: 1.1rem; color: #BBB; margin-top: 0.5rem; }
      .cover-mini-stats { display: flex; gap: 3rem; }
      .cms { display: flex; flex-direction: column; }
      .cms-n { font-family: 'Playfair Display', serif; font-size: 2.5rem; font-weight: 700; color: #FFF; }
      .cms-l { font-size: 0.85rem; color: #888; letter-spacing: 0.1em; text-transform: uppercase; }

      .present-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2rem; }
      .ps-card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 2rem; }
      .ps-n { font-family: 'Playfair Display', serif; font-size: 5rem; font-weight: 700; color: #FFF; line-height: 1; }
      .ps-l { font-size: 0.9rem; color: #BBB; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 0.5rem; }

      .present-risks { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
      .pr-card { background: rgba(255,255,255,0.05); border-left: 3px solid #DC2626; padding: 1rem 1.5rem; }
      .pr-card.risk-riesgo { border-left-color: #F59E0B; }
      .pr-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.3rem; }
      .pr-name { font-family: 'Playfair Display', serif; font-size: 1.5rem; font-weight: 600; color: #FFF; }
      .pr-pct { font-size: 1.5rem; font-weight: 700; color: #999; }
      .pr-meta { font-size: 0.85rem; color: #999; margin-bottom: 0.6rem; }

      .present-list { display: flex; flex-direction: column; gap: 0.6rem; }
      .pl-row { display: grid; grid-template-columns: auto 1fr 200px 140px; gap: 1rem; align-items: center; padding: 0.7rem 1rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); }
      .pl-due { min-width: 50px; }
      .pl-title { font-size: 1rem; font-weight: 600; color: #FFF; }
      .pl-proj { font-size: 0.85rem; color: #888; }
      .pl-asg { display: flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; font-weight: 600; }
      .pl-verb { font-size: 0.85rem; color: #777; font-style: italic; }
    `}</style>
  );
}
