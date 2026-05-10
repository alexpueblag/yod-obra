#!/usr/bin/env python3
"""
Sync Google Sheet -> public/data.json -> git push

Lee scripts/config.json para saber qué Sheet sincronizar y qué hojas.
Para cada hoja descarga el CSV vía gviz, parsea filas de manera resiliente
(ignora etiquetas de rol, headers en cualquier posición, filas vacías) y
arma un data.json con la estructura que entiende src/App.jsx.

Uso:
    python3 scripts/sync_sheet.py            # sincroniza y hace push
    python3 scripts/sync_sheet.py --no-git   # solo escribe data.json (probar)
    python3 scripts/sync_sheet.py --dry-run  # imprime sin escribir nada
    python3 scripts/sync_sheet.py --verbose  # logs detallados
"""

from __future__ import annotations
import argparse
import csv
import io
import json
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "scripts" / "config.json"
OUTPUT_PATH = ROOT / "public" / "data.json"
LOG_DIR = ROOT / ".sync-logs"
LOG_DIR.mkdir(exist_ok=True)


ENTITY_COLUMNS = {
    "dailyLogs": {
        0: "date", 1: "house", 2: "stage", 3: "week", 4: "activity",
        5: "crew", 6: "deliverable", 7: "status", 8: "start", 9: "close",
        10: "milestone", 11: "residentNotes", 12: "supervisorValidated",
        13: "qualityResult", 14: "correctiveAction", 15: "tomorrowAction",
    },
    "restrictions": {
        0: "id", 1: "date", 2: "house", 3: "stage", 4: "title",
        5: "impact", 6: "responsible", 7: "week", 8: "dueDate",
        9: "status", 10: "closeAction", 11: "affectsProjection",
    },
    "lookahead": {
        0: "targetWeek", 1: "house", 2: "stage", 3: "activity",
        4: "prerequisites", 5: "resources", 6: "crew", 7: "responsible",
        8: "dueDate", 9: "status", 10: "ready", 11: "linkedRestriction",
        12: "supervisorComment", 13: "purchasingComment",
    },
    "stageReleases": {
        0: "date", 1: "week", 2: "house", 3: "currentStage", 4: "pendingAction",
        5: "responsible", 6: "nextStage", 7: "finishDate", 8: "released", 9: "evidence",
    },
    "pourReleases": {
        0: "date", 1: "week", 2: "house", 3: "element", 4: "quantity",
        5: "level", 6: "formwork", 7: "steel", 8: "electrical",
        9: "plumbing", 10: "cleaning", 11: "pump", 12: "pumpTime",
        13: "residentNotes", 14: "result", 15: "supervisorAuthorized",
        16: "supervisorNotes", 17: "evidence",
    },
    "warehouse": {
        0: "date", 1: "week", 2: "material", 3: "unit", 4: "category",
        5: "movement", 6: "initialQty", 7: "movementQty", 8: "finalQty",
        9: "supplier", 10: "house", 11: "crew", 12: "registeredBy",
        13: "notes", 14: "evidence",
    },
    "attendance": {
        0: "week", 1: "name", 2: "specialty", 3: "position", 4: "crew",
        5: "wage", 6: "lun", 7: "mar", 8: "mie", 9: "jue",
        10: "vie", 11: "sab", 12: "dom", 13: "paidDays", 14: "base",
        15: "extra", 16: "bonus", 17: "discount", 18: "net",
        19: "residentObservation", 20: "supervisorValidated", 21: "signature",
    },
    "qualityLogs": {
        0: "date", 1: "week", 2: "house", 3: "stage", 4: "review",
        5: "result", 6: "correctiveAction", 7: "responsible", 8: "dueDate",
        9: "closure", 10: "evidence",
    },
    "piecework": {
        0: "date", 1: "week", 2: "house", 3: "contractor", 4: "concept",
        5: "unit", 6: "quantity", 7: "unitPrice", 8: "amount",
        9: "residentReviewed", 10: "paymentDecision", 11: "supervisorAuthorized",
        12: "observations",
    },
    "materialForecasts": {
        0: "week", 1: "material", 2: "unit", 3: "currentStock",
        4: "consumption1", 5: "consumption2", 6: "stockFinal", 7: "minRequest",
        8: "inbound", 9: "inboundDate", 10: "responsible", 11: "risk",
        12: "observations",
    },
    "weeklyReports": {
        0: "week", 1: "startsPlan", 2: "startsReal", 3: "released",
        4: "openRestrictions", 5: "criticalRestrictions", 6: "releasedPours",
        7: "piecework", 8: "payroll", 9: "startCompliance", 10: "startStatus",
        11: "closurePlan", 12: "closureReal", 13: "closureCompliance",
        14: "closureStatus", 15: "supervisorComment", 16: "correctionPlan",
    },
    "crewsPlan": {
        0: "week", 1: "startsPlan", 2: "alba", 3: "block", 4: "losa",
        5: "ep", 6: "extra1", 7: "extra2", 8: "extra3", 9: "closuresPlan",
        10: "notes",
    },
}

NUMERIC_FIELDS = {
    "wage", "extra", "bonus", "discount", "quantity", "unitPrice",
    "currentStock", "consumption1", "consumption2", "initialQty",
    "movementQty", "startsPlan", "startsReal", "alba", "block", "losa",
    "ep", "closuresPlan", "amount", "paidDays", "net", "base", "finalQty",
    "stockFinal", "minRequest", "released", "openRestrictions",
    "criticalRestrictions", "releasedPours", "piecework", "payroll",
    "startCompliance", "closurePlan", "closureReal", "closureCompliance",
    "extra1", "extra2", "extra3",
}

BOOLEAN_FIELDS = {"affectsProjection", "start", "close"}

HEADER_KEYWORDS = {
    "fecha", "casa", "etapa", "semana", "actividad", "cuadrilla",
    "material", "concepto", "id", "responsable", "nombre", "lista",
    "valor", "factor", "uso", "clave", "descripción", "descripcion",
    "sem.", "semana objetivo", "sem. objetivo", "elemento", "volumen",
    "revisión", "revision", "resultado", "decisión", "decision",
    "movimiento", "unidad", "categoría", "categoria", "stock",
    "consumo", "existencia", "fecha llegada", "fecha compromiso",
    "estatus", "cierre", "validó", "valido", "autoriza",
    "proveedor", "intervenciones", "liberadas", "días pagados",
    "destajo autorizado", "meta", "cumplimiento", "extras", "bonos",
    "descuentos", "neto", "días", "salario", "puesto", "especialidad",
    "personal", "dom", "lun", "mar", "mié", "mie", "jue", "vie", "sáb", "sab",
    "tipo", "trazo", "cimbra", "acero", "eléctrico", "electrico",
    "plomería", "plomeria", "limpieza", "bomba", "obs", "observaciones",
    "foto", "evidencia", "firma", "qué llena", "que llena",
    "arranques plan", "arranques reales", "arranques",
}

ROLE_LABEL_KEYWORDS = (
    "residente", "supervisor", "compras", "automático", "automatico",
    "almacenista", "llena ", "fórmula", "formula", "manual",
)

VERBOSE = False


def log(msg: str, level: str = "info") -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    if level == "verbose" and not VERBOSE:
        return
    print(line, flush=True)
    log_file = LOG_DIR / f"sync-{datetime.now().strftime('%Y-%m')}.log"
    try:
        with log_file.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        log(f"ERROR: {CONFIG_PATH} no existe")
        sys.exit(1)
    with CONFIG_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def fetch_sheet_csv(sheet_id: str, sheet_name: str) -> str:
    encoded = urllib.parse.quote(sheet_name)
    url = (
        f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq"
        f"?tqx=out:csv&sheet={encoded}"
    )
    log(f"GET {sheet_name}", level="verbose")
    req = urllib.request.Request(url, headers={"User-Agent": "yod-obra-sync/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}")
        return resp.read().decode("utf-8", errors="replace")


def parse_value(field: str, value: str):
    v = (value or "").strip()
    if v == "":
        if field in NUMERIC_FIELDS:
            return 0
        if field in BOOLEAN_FIELDS:
            return False
        return ""
    if field in BOOLEAN_FIELDS:
        return v.upper() in ("TRUE", "VERDADERO", "SÍ", "SI", "YES", "1")
    if field in NUMERIC_FIELDS:
        cleaned = v.replace("$", "").replace(",", "").replace(" ", "").replace("%", "")
        try:
            num = float(cleaned)
            return int(num) if num.is_integer() else round(num, 4)
        except ValueError:
            return 0
    return v


def is_empty_row(row: list) -> bool:
    return not any(str(c).strip() for c in row)


def is_role_label_row(row: list) -> bool:
    cells = [str(c).strip() for c in row]
    if any("→" in c or "↓" in c or "←" in c for c in cells):
        return True
    non_empty = [c for c in cells if c]
    if not non_empty or len(non_empty) > 5:
        return False
    if all(len(c) > 30 for c in non_empty):
        return False
    has_data = any(any(ch.isdigit() for ch in c) for c in non_empty)
    if has_data:
        return False
    joined = " ".join(non_empty).lower()
    return any(kw in joined for kw in ROLE_LABEL_KEYWORDS)


def is_header_row(row: list) -> bool:
    cells_raw = [str(c).strip() for c in row[:8]]
    cells = [c.lower() for c in cells_raw if c]
    if not cells:
        return False
    matches = sum(1 for c in cells[:4] if c in HEADER_KEYWORDS)
    if matches >= 2:
        return True
    if cells[0] in HEADER_KEYWORDS and all(len(c) < 40 for c in cells[:4]):
        word_count = sum(1 for c in cells[:6] if c.replace(" ", "").isalpha() and len(c) < 30)
        if word_count >= 3:
            return True
    return False


def is_title_row(row: list) -> bool:
    non_empty = [str(c).strip() for c in row if str(c).strip()]
    if len(non_empty) != 1:
        return False
    c = non_empty[0]
    return len(c) > 12 and (c.isupper() or sum(1 for ch in c if ch.isupper()) > len(c) * 0.5)


def parse_entity_rows(csv_text: str, entity: str, data_start_row: int = 1) -> list:
    columns = ENTITY_COLUMNS.get(entity)
    if not columns:
        return []

    reader = csv.reader(io.StringIO(csv_text))
    all_rows = list(reader)
    start_idx = max(0, data_start_row - 1)
    if start_idx >= len(all_rows):
        return []

    parsed = []
    next_id = 1
    for row in all_rows[start_idx:]:
        if is_empty_row(row):
            continue
        if is_role_label_row(row):
            continue
        if is_header_row(row):
            continue
        if is_title_row(row):
            continue

        record = {}
        for col_idx, field_name in columns.items():
            cell = row[col_idx] if col_idx < len(row) else ""
            record[field_name] = parse_value(field_name, cell)

        meaningful = [v for v in record.values() if v not in ("", 0, False, None, 0.0)]
        if len(meaningful) < 2:
            continue

        if "id" not in record or not record.get("id"):
            record["id"] = next_id
        else:
            try:
                record["id"] = int(record["id"]) if record["id"] else next_id
            except (TypeError, ValueError):
                record["id"] = next_id
        if isinstance(record["id"], int):
            next_id = max(next_id, record["id"] + 1)
        else:
            next_id += 1

        parsed.append(record)

    return parsed


def parse_plan(csv_text: str, data_start_row: int = 1) -> list:
    reader = csv.reader(io.StringIO(csv_text))
    all_rows = list(reader)
    start_idx = max(0, data_start_row - 1)

    houses = []
    seen = set()
    for row in all_rows[start_idx:]:
        if not row:
            continue
        for c in range(0, len(row)):
            cell = (row[c] or "").strip()
            if not cell or cell in seen:
                continue
            if cell.startswith("C") and 2 <= len(cell) <= 4:
                rest = cell[1:].lstrip("-")
                if rest.isdigit():
                    start_week = 0
                    if c + 1 < len(row):
                        sw = (row[c + 1] or "").strip()
                        if sw:
                            try:
                                start_week = int(float(sw.replace(",", ".")))
                            except ValueError:
                                pass
                    if cell not in seen:
                        houses.append({"id": cell, "code": cell, "startWeek": start_week or 1})
                        seen.add(cell)
                    break

    def house_num(h):
        try:
            return int(h["code"][1:])
        except ValueError:
            return 999
    houses.sort(key=house_num)
    return houses


def parse_catalogs(csv_text: str, data_start_row: int = 1) -> dict:
    reader = csv.reader(io.StringIO(csv_text))
    all_rows = list(reader)
    start_idx = max(0, data_start_row - 1)

    catalogs = {
        "activityStatus": [], "restrictionStatus": [], "paymentDecision": [],
        "qualityResult": [], "attendanceCodes": [], "yesNoNa": [],
        "crews": [], "materials": [],
    }

    name_map = {
        "estatusactividad": "activityStatus", "restriccion": "restrictionStatus",
        "pago": "paymentDecision", "calidad": "qualityResult",
        "asistencia": "attendanceCodes", "sino": "yesNoNa",
        "cuadrilla": "crews", "material": "materials",
    }

    for row in all_rows[start_idx:]:
        if len(row) < 2:
            continue
        list_name = (row[0] or "").strip().lower()
        value = (row[1] or "").strip()
        if not list_name or not value or list_name == "lista":
            continue
        target = name_map.get(list_name)
        if target and value not in catalogs[target]:
            catalogs[target].append(value)

    if not catalogs["activityStatus"]:
        catalogs["activityStatus"] = ["No inicia", "En proceso", "Liberado", "Atorado", "Reprogramado"]
    if not catalogs["restrictionStatus"]:
        catalogs["restrictionStatus"] = ["Abierta", "En proceso", "Cerrada", "Reprogramada"]
    if not catalogs["paymentDecision"]:
        catalogs["paymentDecision"] = ["Pagar", "Pagar Parcial", "Retener", "No procede"]
    if not catalogs["qualityResult"]:
        catalogs["qualityResult"] = ["Cumple", "No Cumple", "Cumple con Observación"]
    if not catalogs["attendanceCodes"]:
        catalogs["attendanceCodes"] = ["P", "MD", "F", "D", "V", "I"]
    if not catalogs["yesNoNa"]:
        catalogs["yesNoNa"] = ["Sí", "No", "N/A"]

    return catalogs


def post_process_pour_releases(rows: list) -> list:
    fields = ["level", "formwork", "steel", "electrical", "plumbing", "cleaning", "pump"]
    for r in rows:
        r["checklist"] = {f: r.pop(f, "") for f in fields}
    return rows


def post_process_attendance(rows: list) -> list:
    days = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"]
    for r in rows:
        r["days"] = {f: r.pop(f, "") for f in days}
    return rows


def build_data(config: dict) -> dict:
    sheet_id = config.get("sheet_id", "").strip()
    if not sheet_id:
        log("ERROR: scripts/config.json no tiene sheet_id")
        sys.exit(1)

    project = config.get("project", {})
    sheets_cfg = config.get("sheets", {})

    data = {
        "version": 1,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "source": "google-sheets",
        "meta": {
            "projectName": project.get("name", "YOD"),
            "currentWeek": project.get("currentWeek", 1),
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
        },
        "houses": [],
        "dailyLogs": [], "restrictions": [], "lookahead": [],
        "stageReleases": [], "pourReleases": [], "qualityLogs": [],
        "warehouse": [], "materialForecasts": [], "attendance": [],
        "piecework": [], "weeklyReports": [], "crewsPlan": [],
        "catalogs": {},
    }

    for sheet_name, cfg in sheets_cfg.items():
        entity = cfg.get("entity", "")
        data_start = cfg.get("data_start_row", 1)
        try:
            csv_text = fetch_sheet_csv(sheet_id, sheet_name)
        except Exception as e:
            log(f"  ! No se pudo leer {sheet_name}: {e}")
            continue

        if entity == "_plan":
            data["houses"] = parse_plan(csv_text, data_start)
            log(f"  · {sheet_name} → {len(data['houses'])} casas")
        elif entity == "_catalogs":
            data["catalogs"] = parse_catalogs(csv_text, data_start)
            total = sum(len(v) for v in data["catalogs"].values() if isinstance(v, list))
            log(f"  · {sheet_name} → {total} valores en catálogos")
        elif entity in ENTITY_COLUMNS:
            rows = parse_entity_rows(csv_text, entity, data_start)
            if entity == "pourReleases":
                rows = post_process_pour_releases(rows)
            elif entity == "attendance":
                rows = post_process_attendance(rows)
            data[entity] = rows
            log(f"  · {sheet_name} → {len(rows)} registros ({entity})")
        else:
            log(f"  ! Entidad desconocida para {sheet_name}: {entity}")

    if not data["houses"]:
        log("  · Plan vacío, generando casas placeholder C1..C15")
        data["houses"] = [
            {"id": f"C{i+1}", "code": f"C{i+1}", "startWeek": i // 2 + 1}
            for i in range(15)
        ]

    return data


def normalize_for_diff(json_str: str) -> str:
    try:
        obj = json.loads(json_str)
        obj["exportedAt"] = ""
        obj.setdefault("meta", {})["lastUpdated"] = ""
        return json.dumps(obj, ensure_ascii=False, sort_keys=True)
    except Exception:
        return json_str


def write_data(data: dict, dry_run: bool) -> bool:
    new_str = json.dumps(data, ensure_ascii=False, indent=2)

    if dry_run:
        print(new_str[:2000])
        log(f"DRY-RUN: data.json tendría {len(new_str)} bytes")
        return False

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    old_str = OUTPUT_PATH.read_text(encoding="utf-8") if OUTPUT_PATH.exists() else ""

    if normalize_for_diff(new_str) == normalize_for_diff(old_str):
        log("Sin cambios reales en data.json")
        return False

    OUTPUT_PATH.write_text(new_str, encoding="utf-8")
    log(f"Escrito {OUTPUT_PATH} ({len(new_str)} bytes)")
    return True


def git_push() -> None:
    try:
        subprocess.run(["git", "add", "public/data.json"], cwd=ROOT, check=True)
        diff = subprocess.run(["git", "diff", "--staged", "--quiet"], cwd=ROOT)
        if diff.returncode == 0:
            log("Sin cambios staged.")
            return
        ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
        subprocess.run(["git", "commit", "-m", f"sync: auto {ts}"], cwd=ROOT, check=True)
        subprocess.run(["git", "push"], cwd=ROOT, check=True)
        log("Push completado ✓")
    except subprocess.CalledProcessError as e:
        log(f"git falló: {e}")


def main() -> int:
    global VERBOSE
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-git", action="store_true", help="No hacer git push, solo escribir")
    parser.add_argument("--dry-run", action="store_true", help="Imprimir sin escribir")
    parser.add_argument("--verbose", "-v", action="store_true", help="Logs detallados")
    args = parser.parse_args()

    VERBOSE = args.verbose

    log("=" * 60)
    log("Iniciando sync de Google Sheet → public/data.json")

    config = load_config()
    log(f"Sheet: {config.get('sheet_id')}")
    log(f"Hojas a sincronizar: {len(config.get('sheets', {}))}")

    try:
        data = build_data(config)
    except KeyboardInterrupt:
        log("Cancelado por el usuario")
        return 1
    except Exception as e:
        log(f"ERROR construyendo data: {e}")
        return 1

    changed = write_data(data, dry_run=args.dry_run)

    if changed and not args.no_git and not args.dry_run:
        log("Cambios detectados. Commit + push…")
        git_push()
    elif args.no_git:
        log("Modo --no-git: no se hace push")

    log("Sync OK ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main())
