import { formatMinutes, formatClock } from './stats.js';

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return `${HEBREW_MONTHS[m - 1]} ${y}`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const TH = 'background:#f3f4f6;padding:8px;border:1px solid #d1d5db;font-weight:bold;font-size:12px;';
const TD = 'padding:7px;border:1px solid #d1d5db;text-align:center;font-size:12px;';

function table(headers, rows) {
  return `
    <table style="width:100%;border-collapse:collapse;margin:8px 0 22px 0;">
      <thead><tr>${headers.map((h) => `<th style="${TH}">${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((cells) => `<tr>${cells.map((c) => `<td style="${TD}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>`;
}

// scope: 'all' | 'teacher' | 'student'.  Signatures are only included for the
// narrower scopes, where the detailed table is short enough to be useful.
export function buildSummaryReportHtml({ scope, scopeName, month, totals, byTeacher, byStudent, lessons, signatureUrls = {}, remainingByStudent = null }) {
  const title =
    scope === 'teacher' ? `דוח שעות חודשי - מורה: ${scopeName}` :
    scope === 'student' ? `דוח שעות חודשי - תלמיד: ${scopeName}` :
    'דוח שעות חודשי כללי';

  const teacherSection =
    scope === 'all'
      ? `<h3 style="margin:18px 0 0 0;font-size:14px;">סיכום לפי מורה</h3>` +
        table(['מורה', 'תלמידים', 'שיעורים', 'שעות'], byTeacher.map((t) => [esc(t.name), t.students, t.lessons, formatMinutes(t.minutes)]))
      : '';

  const showRemaining = remainingByStudent !== null;
  const studentSection =
    scope !== 'student'
      ? `<h3 style="margin:18px 0 0 0;font-size:14px;">סיכום לפי תלמיד</h3>` +
        table(
          ['תלמיד', ...(scope === 'all' ? ['מורה'] : []), 'שיעורים', 'שעות', ...(showRemaining ? ['שיעורים שנותרו'] : [])],
          byStudent.map((s) => [
            esc(s.name),
            ...(scope === 'all' ? [esc(s.teachers.join(', '))] : []),
            s.lessons,
            formatMinutes(s.minutes),
            ...(showRemaining ? [s.studentId && remainingByStudent[s.studentId] !== null && remainingByStudent[s.studentId] !== undefined ? remainingByStudent[s.studentId] : '—'] : []),
          ])
        )
      : '';

  const withSignatures = scope !== 'all';
  const detailHeaders = ['תאריך', 'התחלה', 'סיום', 'שעות', ...(scope !== 'student' ? ['תלמיד'] : []), ...(scope !== 'teacher' ? ['מורה'] : []), ...(withSignatures ? ['חתימה'] : [])];
  const detailRows = lessons.map((l) => [
    esc(l.date),
    formatClock(l.startMinutes),
    formatClock(l.endMinutes),
    formatMinutes(l.minutes),
    ...(scope !== 'student' ? [esc(l.studentName)] : []),
    ...(scope !== 'teacher' ? [esc(l.teacherName)] : []),
    ...(withSignatures ? [signatureUrls[l.signatureAssetId] ? `<img src="${esc(signatureUrls[l.signatureAssetId])}" style="height:34px;" />` : ''] : []),
  ]);

  return `<!doctype html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8" /></head>
<body style="margin:0;">
  <div style="font-family:Arial,sans-serif;padding:30px;direction:rtl;background:#fff;color:#1f2937;">
    <h1 style="text-align:center;margin:0 0 4px 0;font-size:22px;">${esc(title)}</h1>
    <p style="text-align:center;margin:0 0 18px 0;color:#4b5563;font-size:14px;">${esc(monthLabel(month))} · AllTeachers</p>

    <div style="display:flex;gap:12px;margin-bottom:6px;">
      <div style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:10px;text-align:center;"><div style="font-size:20px;font-weight:bold;">${formatMinutes(totals.minutes)}</div><div style="font-size:12px;color:#6b7280;">סה"כ שעות</div></div>
      <div style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:10px;text-align:center;"><div style="font-size:20px;font-weight:bold;">${totals.lessons}</div><div style="font-size:12px;color:#6b7280;">שיעורים</div></div>
      <div style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:10px;text-align:center;"><div style="font-size:20px;font-weight:bold;">${totals.students}</div><div style="font-size:12px;color:#6b7280;">תלמידים</div></div>
      ${scope === 'all' ? `<div style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:10px;text-align:center;"><div style="font-size:20px;font-weight:bold;">${totals.teachers}</div><div style="font-size:12px;color:#6b7280;">מורים</div></div>` : ''}
    </div>

    ${teacherSection}
    ${studentSection}

    <h3 style="margin:18px 0 0 0;font-size:14px;">דיווח מפורט</h3>
    ${lessons.length ? table(detailHeaders, detailRows) : '<p style="color:#6b7280;">אין שיעורים מדווחים בחודש זה.</p>'}
  </div>
</body>
</html>`;
}
