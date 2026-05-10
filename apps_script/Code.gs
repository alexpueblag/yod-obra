/**
 * yod-obra · Apps Script de escritura al Google Sheet
 * ────────────────────────────────────────────────────────────────────
 * La app web (https://alexpueblag.github.io/yod-obra/) hace POST aquí
 * cuando el residente/supervisor captura desde un formulario.
 * Este script valida un secreto compartido y escribe la fila correcta
 * en la hoja correspondiente.
 *
 * DESPLIEGUE:
 *   1. Pega este archivo completo en script.google.com como un proyecto nuevo
 *      vinculado al Sheet "YOD San Fco Control Obra Negra".
 *   2. Cambia SHARED_SECRET abajo por una cadena random (ej: 24 caracteres).
 *   3. Implementar > Nueva implementación > Tipo: Aplicación web.
 *      - Ejecutar como: Yo (tu cuenta de Google)
 *      - Quién tiene acceso: Cualquier usuario
 *   4. Copia la URL ".../exec" que te da y ponla en src/config.js como
 *      APPS_SCRIPT_URL. Pon el mismo SHARED_SECRET en src/config.js.
 *   5. Push al repo. GitHub Actions deploya y el botón "Guardar y enviar a
 *      Sheet" empezará a escribir de verdad.
 * ────────────────────────────────────────────────────────────────────
 */

// ⚠️ CÁMBIAME: pon una cadena larga aleatoria. La misma debe estar en src/config.js
const SHARED_SECRET = 'CAMBIAR-ESTE-SECRETO-AQUI-USA-UNA-CADENA-LARGA-RANDOM';

// Mapeo entidad → orden de columnas (idéntico al de scripts/sync_sheet.py).
// Cada array define el orden en que se escriben los campos del record.
const ENTITY_COLUMNS = {
  dailyLogs: ['date', 'house', 'stage', 'week', 'activity', 'crew', 'deliverable', 'status', 'start', 'close', 'milestone', 'residentNotes', 'supervisorValidated', 'qualityResult', 'correctiveAction', 'tomorrowAction'],
  restrictions: ['id', 'date', 'house', 'stage', 'title', 'impact', 'responsible', 'week', 'dueDate', 'status', 'closeAction', 'affectsProjection'],
  lookahead: ['targetWeek', 'house', 'stage', 'activity', 'prerequisites', 'resources', 'crew', 'responsible', 'dueDate', 'status', 'ready', 'linkedRestriction', 'supervisorComment', 'purchasingComment'],
  stageReleases: ['date', 'week', 'house', 'currentStage', 'pendingAction', 'responsible', 'nextStage', 'finishDate', 'released', 'evidence'],
  pourReleases: ['date', 'week', 'house', 'element', 'quantity', 'level', 'formwork', 'steel', 'electrical', 'plumbing', 'cleaning', 'pump', 'pumpTime', 'residentNotes', 'result', 'supervisorAuthorized', 'supervisorNotes', 'evidence'],
  warehouse: ['date', 'week', 'material', 'unit', 'category', 'movement', 'initialQty', 'movementQty', 'finalQty', 'supplier', 'house', 'crew', 'registeredBy', 'notes', 'evidence'],
  attendance: ['week', 'name', 'specialty', 'position', 'crew', 'wage', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom', 'paidDays', 'base', 'extra', 'bonus', 'discount', 'net', 'residentObservation', 'supervisorValidated', 'signature'],
  qualityLogs: ['date', 'week', 'house', 'stage', 'review', 'result', 'correctiveAction', 'responsible', 'dueDate', 'closure', 'evidence'],
  piecework: ['date', 'week', 'house', 'contractor', 'concept', 'unit', 'quantity', 'unitPrice', 'amount', 'residentReviewed', 'paymentDecision', 'supervisorAuthorized', 'observations'],
  materialForecasts: ['week', 'material', 'unit', 'currentStock', 'consumption1', 'consumption2', 'stockFinal', 'minRequest', 'inbound', 'inboundDate', 'responsible', 'risk', 'observations'],
  weeklyReport: ['week', 'startsPlan', 'startsReal', 'released', 'openRestrictions', 'criticalRestrictions', 'releasedPours', 'piecework', 'payroll', 'startCompliance', 'startStatus', 'closurePlan', 'closureReal', 'closureCompliance', 'closureStatus', 'supervisorComment', 'correctionPlan'],
};


/**
 * Endpoint POST que recibe capturas de la app y las escribe al Sheet.
 * La app envía Content-Type: text/plain (para evitar CORS preflight).
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut({ ok: false, error: 'Sin body en la petición' });
    }

    const body = JSON.parse(e.postData.contents);

    if (body.secret !== SHARED_SECRET) {
      return jsonOut({ ok: false, error: 'Secreto inválido' });
    }

    if (body.action !== 'append') {
      return jsonOut({ ok: false, error: 'Acción no soportada: ' + body.action });
    }

    const entity = body.entity;
    const payload = body.payload || {};
    const sheetName = payload.sheetName;
    const record = payload.record || {};

    if (!sheetName) {
      return jsonOut({ ok: false, error: 'sheetName requerido en payload' });
    }
    if (!ENTITY_COLUMNS[entity]) {
      return jsonOut({ ok: false, error: 'Entidad desconocida: ' + entity });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return jsonOut({ ok: false, error: 'Hoja no encontrada: ' + sheetName });
    }

    // Construir fila ordenada según ENTITY_COLUMNS
    const columns = ENTITY_COLUMNS[entity];
    const row = columns.map(function (field) {
      return normalizeValue(record[field]);
    });

    sheet.appendRow(row);
    const newRow = sheet.getLastRow();

    Logger.log('Append OK | sheet=' + sheetName + ' row=' + newRow + ' entity=' + entity + ' user=' + (payload.user || '?'));

    return jsonOut({ ok: true, row: newRow, sheetName: sheetName });

  } catch (err) {
    Logger.log('ERROR doPost: ' + err);
    return jsonOut({
      ok: false,
      error: err.toString(),
      stack: (err.stack || '').toString().slice(0, 400),
    });
  }
}


/**
 * Endpoint GET para verificar que el deploy está vivo.
 * Útil para hacer ping desde el navegador después de desplegar.
 */
function doGet(e) {
  return jsonOut({
    ok: true,
    message: 'yod-obra Apps Script activo',
    time: new Date().toISOString(),
    entities: Object.keys(ENTITY_COLUMNS),
  });
}


function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


function normalizeValue(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}


/**
 * Prueba manual desde el editor de Apps Script.
 * Selecciona testWrite del dropdown y dale ▶ Run.
 * Debe agregar una fila C99/TEST a Restricciones_Diario.
 * Después de probar, BORRA esa fila del Sheet a mano.
 */
function testWrite() {
  const fakeRequest = {
    postData: {
      contents: JSON.stringify({
        secret: SHARED_SECRET,
        action: 'append',
        entity: 'restrictions',
        payload: {
          sheetName: 'Restricciones_Diario',
          user: 'testWrite()',
          role: 'admin',
          record: {
            id: 999,
            date: new Date().toLocaleDateString('es-MX'),
            house: 'C99',
            stage: 'TEST',
            title: 'Prueba desde testWrite()',
            impact: 'ninguno - borrar después',
            responsible: 'Apps Script',
            week: 'S1',
            dueDate: '',
            status: 'Cerrada',
            closeAction: 'Test',
            affectsProjection: false,
          },
        },
      }),
    },
  };
  const result = doPost(fakeRequest);
  Logger.log(result.getContent());
}
