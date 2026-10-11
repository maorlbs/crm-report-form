import ExcelJS from 'exceljs';
import { formatClock } from './stats.js';
import { monthLabel } from './summary-report-template.js';

function addTable(sheet, headers, rows) {
  const header = sheet.addRow(headers);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    cell.alignment = { horizontal: 'center' };
  });
  rows.forEach((r) => sheet.addRow(r));
}

// Hours are stored as a real number (fractional hours) with a 0.00 format so
// the sheet can be summed and filtered in Excel.
const hours = (minutes) => Math.round((minutes / 60) * 100) / 100;

export async function buildMonthlyWorkbook({ scope, scopeName, month, totals, byTeacher, byStudent, lessons, remainingByStudent }) {
  const workbook = new ExcelJS.Workbook();
  const rtl = [{ rightToLeft: true }];

  const summary = workbook.addWorksheet('סיכום', { views: rtl });
  const title =
    scope === 'teacher' ? `דוח שעות חודשי - מורה: ${scopeName}` :
    scope === 'student' ? `דוח שעות חודשי - תלמיד: ${scopeName}` :
    'דוח שעות חודשי כללי';
  summary.addRow([title]).font = { bold: true, size: 14 };
  summary.addRow([monthLabel(month)]);
  summary.addRow([]);
  addTable(summary, ['סה"כ שעות', 'שיעורים', 'תלמידים', ...(scope === 'all' ? ['מורים'] : [])], [
    [hours(totals.minutes), totals.lessons, totals.students, ...(scope === 'all' ? [totals.teachers] : [])],
  ]);

  if (scope === 'all') {
    summary.addRow([]);
    summary.addRow(['סיכום לפי מורה']).font = { bold: true };
    addTable(summary, ['מורה', 'תלמידים', 'שיעורים', 'שעות'], byTeacher.map((t) => [t.name, t.students, t.lessons, hours(t.minutes)]));
  }

  if (scope !== 'student') {
    const showRemaining = remainingByStudent !== null;
    summary.addRow([]);
    summary.addRow(['סיכום לפי תלמיד']).font = { bold: true };
    addTable(
      summary,
      ['תלמיד', 'מורה', 'שיעורים', 'שעות', ...(showRemaining ? ['שיעורים שנותרו'] : [])],
      byStudent.map((s) => [
        s.name,
        s.teachers.join(', '),
        s.lessons,
        hours(s.minutes),
        ...(showRemaining ? [s.studentId ? remainingByStudent[s.studentId] ?? '' : ''] : []),
      ])
    );
  }
  summary.columns.forEach((c) => (c.width = 22));
  summary.eachRow((row) => row.eachCell((cell) => { if (typeof cell.value === 'number' && !Number.isInteger(cell.value)) cell.numFmt = '0.00'; }));

  const detail = workbook.addWorksheet('פירוט', { views: rtl });
  addTable(
    detail,
    ['תאריך', 'שעת התחלה', 'שעת סיום', 'שעות', 'תלמיד', 'מורה'],
    lessons.map((l) => [l.date, formatClock(l.startMinutes), formatClock(l.endMinutes), hours(l.minutes), l.studentName, l.teacherName])
  );
  detail.getColumn(4).numFmt = '0.00';
  detail.columns.forEach((c) => (c.width = 18));
  detail.getColumn(5).width = 28;
  detail.getColumn(6).width = 28;

  return workbook.xlsx.writeBuffer();
}
