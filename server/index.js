import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import puppeteer from 'puppeteer';
import {
  executeGraphQL,
  findItemIdByName,
  findTeacherByEmail,
  setTeacherPassword,
  listAllTeachers,
  getStudentsForTeacher,
  findActiveProjectItemForStudent,
  createProjectSubitem,
  uploadProjectSubitemSignature,
  createLessonItem,
  createReportItem,
  getAssetPublicUrls,
  uploadFileToColumn,
  fetchAllLessons,
  getRemainingLessonsByStudent,
  TEACHER_BOARD_ID,
  CONTACT_BOARD_ID,
  REPORT_BOARD_ID,
} from './monday-client.js';
import { buildReportHtml } from './report-template.js';
import { buildSummaryReportHtml } from './summary-report-template.js';
import { buildMonthlyWorkbook } from './excel-report.js';
import { buildSummary, sortLessons, isValidMonth, currentMonth } from './stats.js';
import {
  createSession,
  requireAuth,
  requireAdmin,
  isAdminEmail,
  getAdminDisplayName,
  getAdminCredential,
  setAdminCredential,
  hashPassword,
  verifyPassword,
} from './auth.js';

const upload = multer({ storage: multer.memoryStorage() });

const app = express();

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5183';
app.use(cors({ origin: allowedOrigin, exposedHeaders: ['Content-Disposition'] }));
app.use(express.json({ limit: '20mb' }));

function requireWebhookSecret(req, res, next) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    console.error('WEBHOOK_SECRET is not set - refusing all webhook requests until it is configured.');
    return res.status(500).json({ error: 'Webhook is not configured' });
  }
  if (req.headers['x-webhook-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// --- Auth --------------------------------------------------------------

app.post('/api/login', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim();
    const password = req.body?.password || '';
    if (!email || !password) return res.status(400).json({ error: 'יש להזין אימייל וסיסמה' });

    // Admins are system-level super users, kept entirely independent of the
    // מורים board - they authenticate against a local credential store
    // instead, so they keep working even if they have no item there.
    if (isAdminEmail(email)) {
      const { passwordHash, mustResetPassword } = await getAdminCredential(email);
      const passwordOk = await verifyPassword(password, passwordHash);
      if (!passwordOk) {
        return res.status(401).json({ error: 'אימייל או סיסמה שגויים' });
      }

      const name = getAdminDisplayName(email);
      const token = createSession({ teacherId: null, email: email.toLowerCase(), name, role: 'admin' });

      return res.json({
        token,
        teacher: { id: null, name },
        role: 'admin',
        mustResetPassword,
        students: [],
      });
    }

    const teacher = await findTeacherByEmail(email);
    if (!teacher) {
      return res.status(404).json({ error: 'לא נמצא משתמש עם האימייל הזה במערכת' });
    }

    // First-ever login for this teacher: auto-provision a password from their
    // phone number on the מורים board, and force a reset right after.
    let { passwordHash, mustResetPassword } = teacher;
    if (!passwordHash) {
      if (!teacher.phone) {
        return res.status(400).json({ error: 'לא הוגדר טלפון במערכת עבור משתמש זה - יש לפנות למנהל המערכת' });
      }
      passwordHash = await hashPassword(teacher.phone);
      mustResetPassword = true;
      await setTeacherPassword(teacher.id, passwordHash, true);
    }

    const passwordOk = await verifyPassword(password, passwordHash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'אימייל או סיסמה שגויים' });
    }

    const token = createSession({ teacherId: teacher.id, email: teacher.email, name: teacher.name, role: 'teacher' });
    const students = await getStudentsForTeacher(teacher.id);

    res.json({
      token,
      teacher: { id: teacher.id, name: teacher.name },
      role: 'teacher',
      mustResetPassword,
      students,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'שגיאה בהתחברות למערכת. אנא נסה שנית.' });
  }
});

app.post('/api/reset-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'יש להזין סיסמה נוכחית וסיסמה חדשה' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'הסיסמה החדשה חייבת להכיל לפחות 6 תווים' });
    }

    if (req.session.role === 'admin') {
      const { passwordHash } = await getAdminCredential(req.session.email);
      const ok = await verifyPassword(currentPassword, passwordHash);
      if (!ok) return res.status(401).json({ error: 'הסיסמה הנוכחית שגויה' });

      setAdminCredential(req.session.email, await hashPassword(newPassword), false);
      return res.json({ success: true });
    }

    const teacher = await findTeacherByEmail(req.session.email);
    if (!teacher) return res.status(404).json({ error: 'משתמש לא נמצא' });

    const ok = await verifyPassword(currentPassword, teacher.passwordHash);
    if (!ok) return res.status(401).json({ error: 'הסיסמה הנוכחית שגויה' });

    const newHash = await hashPassword(newPassword);
    await setTeacherPassword(teacher.id, newHash, false);

    res.json({ success: true });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'שגיאה באיפוס הסיסמה. אנא נסה שנית.' });
  }
});

// --- Admin ---------------------------------------------------------------

app.get('/api/admin/teachers', requireAdmin, async (req, res) => {
  try {
    const teachers = await listAllTeachers();
    const visible = teachers.filter((t) => !isAdminEmail(t.email));
    res.json({
      teachers: visible.map((t) => ({
        id: t.id,
        name: t.name,
        email: t.email,
        mustResetPassword: t.mustResetPassword,
      })),
    });
  } catch (err) {
    console.error('List teachers error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת רשימת המורים' });
  }
});

app.post('/api/admin/teachers/:teacherId/reset-password', requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'הסיסמה החדשה חייבת להכיל לפחות 6 תווים' });
    }
    const newHash = await hashPassword(newPassword);
    // An admin-set password is treated as a new temporary one - the teacher
    // still has to choose their own on next login.
    await setTeacherPassword(req.params.teacherId, newHash, true);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin reset password error:', err);
    res.status(500).json({ error: 'שגיאה באיפוס הסיסמה' });
  }
});

app.get('/api/admin/act-as/:teacherId', requireAdmin, async (req, res) => {
  try {
    const teacherId = req.params.teacherId;
    const teachers = await listAllTeachers();
    const teacher = teachers.find((t) => t.id === teacherId);
    if (!teacher) return res.status(404).json({ error: 'מורה לא נמצא' });

    const students = await getStudentsForTeacher(teacherId);
    res.json({ teacher: { id: teacher.id, name: teacher.name }, students });
  } catch (err) {
    console.error('Act-as error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת נתוני המורה' });
  }
});

// --- Dashboards & monthly reports -------------------------------------------

function resolveMonth(req) {
  return isValidMonth(req.query.month) ? req.query.month : currentMonth();
}

function monthsWithData(lessons) {
  return [...new Set([currentMonth(), ...lessons.map((l) => l.month).filter(Boolean)])].sort().reverse();
}

async function renderPdf(html) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    return await page.pdf({
      format: 'a4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });
  } finally {
    if (browser) await browser.close();
  }
}

async function loadSignatureUrls(lessons) {
  const ids = [...new Set(lessons.map((l) => l.signatureAssetId).filter(Boolean).map(String))];
  const urls = {};
  try {
    for (let i = 0; i < ids.length; i += 100) {
      Object.assign(urls, await getAssetPublicUrls(ids.slice(i, i + 100)));
    }
  } catch (err) {
    console.error('Could not load signature images for report, continuing without them:', err);
  }
  return urls;
}

// scope: 'all' | 'teacher' | 'student'. `filter` narrows the lessons to it.
// format: 'pdf' (default) or 'xlsx'.
async function sendMonthlyReport(res, { scope, scopeName, month, filter, includeRemaining, format = 'pdf' }) {
  const all = await fetchAllLessons();
  const lessons = sortLessons(all.filter((l) => l.month === month && filter(l))).reverse();
  const summary = buildSummary(all, month, filter);
  const remainingByStudent = includeRemaining
    ? await getRemainingLessonsByStudent(summary.byStudent.map((s) => s.studentId))
    : null;

  const baseName = `דוח_שעות_${month}${scopeName ? `_${scopeName}` : ''}`;

  if (format === 'xlsx') {
    const buffer = await buildMonthlyWorkbook({
      scope,
      scopeName,
      month,
      totals: summary.totals,
      byTeacher: summary.byTeacher,
      byStudent: summary.byStudent,
      lessons,
      remainingByStudent,
    });
    res.attachment(`${baseName}.xlsx`);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(Buffer.from(buffer));
  }

  const signatureUrls = scope === 'all' ? {} : await loadSignatureUrls(lessons);
  const html = buildSummaryReportHtml({
    scope,
    scopeName,
    month,
    totals: summary.totals,
    byTeacher: summary.byTeacher,
    byStudent: summary.byStudent,
    lessons,
    signatureUrls,
    remainingByStudent,
  });
  const pdf = await renderPdf(html);

  res.attachment(`${baseName}.pdf`);
  res.type('application/pdf');
  res.send(pdf);
}

function resolveFormat(req) {
  return req.query.format === 'xlsx' ? 'xlsx' : 'pdf';
}

// Teacher: own history + dashboard
app.get('/api/my/summary', requireAuth, async (req, res) => {
  try {
    if (req.session.role !== 'teacher') return res.status(403).json({ error: 'זמין למורים בלבד' });
    const month = resolveMonth(req);
    const all = await fetchAllLessons();
    const mine = (l) => l.teacherName === req.session.name;
    const summary = buildSummary(all, month, mine);
    const { byTeacher: _omit, ...rest } = summary;
    res.json({ ...rest, teacherName: req.session.name, months: monthsWithData(all.filter(mine)) });
  } catch (err) {
    console.error('My summary error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת הנתונים' });
  }
});

app.get('/api/my/report.pdf', requireAuth, async (req, res) => {
  try {
    if (req.session.role !== 'teacher') return res.status(403).json({ error: 'זמין למורים בלבד' });
    await sendMonthlyReport(res, {
      scope: 'teacher',
      scopeName: req.session.name,
      month: resolveMonth(req),
      filter: (l) => l.teacherName === req.session.name,
      includeRemaining: false,
      format: resolveFormat(req),
    });
  } catch (err) {
    console.error('My report error:', err);
    res.status(500).json({ error: 'שגיאה ביצירת הדוח' });
  }
});

// Admin: overview of everything
app.get('/api/admin/summary', requireAdmin, async (req, res) => {
  try {
    const month = resolveMonth(req);
    const all = await fetchAllLessons();
    const summary = buildSummary(all, month);
    const remaining = await getRemainingLessonsByStudent(summary.byStudent.map((s) => s.studentId));
    summary.byStudent = summary.byStudent.map((s) => ({
      ...s,
      remaining: s.studentId ? remaining[s.studentId] ?? null : null,
    }));
    res.json({ ...summary, months: monthsWithData(all) });
  } catch (err) {
    console.error('Admin summary error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת הנתונים' });
  }
});

// Admin: one teacher's dashboard (same shape as /api/my/summary)
app.get('/api/admin/teachers/:teacherId/summary', requireAdmin, async (req, res) => {
  try {
    const teachers = await listAllTeachers();
    const teacher = teachers.find((t) => t.id === req.params.teacherId);
    if (!teacher) return res.status(404).json({ error: 'מורה לא נמצא' });

    const month = resolveMonth(req);
    const all = await fetchAllLessons();
    const mine = (l) => l.teacherName === teacher.name;
    const summary = buildSummary(all, month, mine);
    const remaining = await getRemainingLessonsByStudent(summary.byStudent.map((s) => s.studentId));
    summary.byStudent = summary.byStudent.map((s) => ({
      ...s,
      remaining: s.studentId ? remaining[s.studentId] ?? null : null,
    }));
    const { byTeacher: _omit, ...rest } = summary;
    res.json({ ...rest, teacherName: teacher.name, months: monthsWithData(all.filter(mine)) });
  } catch (err) {
    console.error('Admin teacher summary error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת הנתונים' });
  }
});

// Admin: monthly PDF - scope=all | teacher (teacherId) | student (studentKey)
app.get('/api/admin/report.pdf', requireAdmin, async (req, res) => {
  try {
    const month = resolveMonth(req);
    const scope = ['teacher', 'student'].includes(req.query.scope) ? req.query.scope : 'all';

    if (scope === 'teacher') {
      const teachers = await listAllTeachers();
      const teacher = teachers.find((t) => t.id === req.query.teacherId);
      if (!teacher) return res.status(404).json({ error: 'מורה לא נמצא' });
      return await sendMonthlyReport(res, {
        scope,
        scopeName: teacher.name,
        month,
        filter: (l) => l.teacherName === teacher.name,
        includeRemaining: true,
        format: resolveFormat(req),
      });
    }

    if (scope === 'student') {
      const studentKey = String(req.query.studentKey || '');
      const all = await fetchAllLessons();
      const sample = all.find((l) => l.studentKey === studentKey);
      if (!sample) return res.status(404).json({ error: 'תלמיד לא נמצא' });
      return await sendMonthlyReport(res, {
        scope,
        scopeName: sample.studentName,
        month,
        filter: (l) => l.studentKey === studentKey,
        includeRemaining: false,
        format: resolveFormat(req),
      });
    }

    await sendMonthlyReport(res, { scope: 'all', scopeName: '', month, filter: () => true, includeRemaining: true, format: resolveFormat(req) });
  } catch (err) {
    console.error('Admin report error:', err);
    res.status(500).json({ error: 'שגיאה ביצירת הדוח' });
  }
});

// --- App API ---------------------------------------------------------------

app.post('/api/lessons', requireAuth, upload.single('signature'), async (req, res) => {
  try {
    const { studentId, studentName, teacherId, teacherName, date, startHour, startMinute, endHour, endMinute } = req.body;
    if (!studentName || !teacherName || !date || !req.file) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const itemId = await createLessonItem({
      studentId,
      studentName,
      teacherName,
      date,
      startHour: Number(startHour),
      startMinute: Number(startMinute),
      endHour: Number(endHour),
      endMinute: Number(endMinute),
    });

    await uploadFileToColumn(itemId, 'signatureiwrnxr4b', req.file.buffer, req.file.originalname, req.file.mimetype);

    // File this lesson as a subitem under the student's active package/project
    // item (matched via their linked deal). Best-effort: the project board is
    // still being populated, so a miss here shouldn't fail the whole request.
    if (studentId) {
      try {
        const projectItemId = await findActiveProjectItemForStudent(studentId);
        if (projectItemId) {
          const subitemId = await createProjectSubitem(
            projectItemId,
            `${date} ${startHour}:${String(startMinute).padStart(2, '0')}-${endHour}:${String(endMinute).padStart(2, '0')} - ${studentName}`,
            {
              studentId,
              teacherId,
              teacherName,
              date,
              startHour: Number(startHour),
              startMinute: Number(startMinute),
              endHour: Number(endHour),
              endMinute: Number(endMinute),
            }
          );
          if (subitemId) {
            await uploadProjectSubitemSignature(subitemId, req.file.buffer, req.file.originalname, req.file.mimetype);
          }
        } else {
          console.warn('No active project item found for student', studentId);
        }
      } catch (err) {
        console.error('Failed to file lesson as project subitem for student', studentId, err);
      }
    }

    res.json({ itemId });
  } catch (err) {
    console.error('Create lesson error:', err);
    res.status(500).json({ error: 'שגיאה בשמירת הנתונים. אנא נסה שנית.' });
  }
});

app.post('/api/reports', requireAuth, upload.single('pdf'), async (req, res) => {
  try {
    const { studentId, studentName, teacherId, teacherName, totalHours } = req.body;
    if (!studentName || !teacherName || !totalHours || !req.file) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const reportItemId = await createReportItem({
      studentName,
      teacherName,
      teacherId,
      studentId,
      totalHours: Number(totalHours),
    });

    await uploadFileToColumn(reportItemId, 'file_mm4sd076', req.file.buffer, req.file.originalname, req.file.mimetype);

    res.json({ reportItemId });
  } catch (err) {
    console.error('Create report error:', err);
    res.status(500).json({ error: 'שגיאה בשמירת הנתונים. אנא נסה שנית.' });
  }
});

// --- Webhook (Make.com automation) -----------------------------------------

function getColumn(item, columnId) {
  return item.column_values?.find((c) => c.id === columnId);
}

function parseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function formatHour(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Accepts either the raw monday GraphQL response, or the shape an automation's
// HTTP module forwards it in: [{ body: { data: {...} }, headers, statusCode }]
function extractItems(payload) {
  const unwrapped = Array.isArray(payload) && payload[0]?.body?.data ? payload[0].body.data : payload?.data || payload;
  return unwrapped?.boards?.[0]?.items_page?.items || [];
}

app.post('/webhook/lesson-report', requireWebhookSecret, async (req, res) => {
  let browser;
  try {
    const items = extractItems(req.body);
    if (!items.length) {
      return res.status(400).json({ error: 'No lesson items found in payload' });
    }

    const studentName = items[0].name;
    const teacherName = getColumn(items[0], 'text_mm5yfq79')?.text;

    // Resolve signature asset ids to real, publicly-downloadable S3 URLs
    // (the raw column URLs are protected_static and need a monday session).
    const assetIds = items
      .map((item) => parseJson(getColumn(item, 'signatureiwrnxr4b')?.value)?.files?.[0]?.assetId)
      .filter(Boolean);
    const assetUrls = await getAssetPublicUrls(assetIds);

    let totalHours = 0;
    const reportRows = items.map((item) => {
      const date = getColumn(item, 'date_mm5y2ekf')?.text;
      const start = parseJson(getColumn(item, 'hour_mm5y68a6')?.value);
      const end = parseJson(getColumn(item, 'hour_mm5ye9ek')?.value);
      const hours = (end.hour * 60 + end.minute - (start.hour * 60 + start.minute)) / 60;
      totalHours += hours;

      const assetId = parseJson(getColumn(item, 'signatureiwrnxr4b')?.value)?.files?.[0]?.assetId;

      return {
        date,
        startTime: formatHour(start.hour, start.minute),
        endTime: formatHour(end.hour, end.minute),
        hours: hours.toFixed(2),
        signatureUrl: assetId ? assetUrls[assetId] : null,
      };
    });

    // Resolve teacher/student item ids by name, for the relation columns
    const [teacherId, studentId] = await Promise.all([
      findItemIdByName(TEACHER_BOARD_ID, teacherName),
      findItemIdByName(CONTACT_BOARD_ID, studentName),
    ]);

    // Render the combined report to a real PDF (server-side equivalent of the
    // browser's html2pdf flow)
    const html = buildReportHtml({ studentName, teacherName, reportRows, totalHours });
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
    const pdfBuffer = await page.pdf({
      format: 'a4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });
    await browser.close();
    browser = null;

    const reportItemId = await createReportItem({ studentName, teacherName, teacherId, studentId, totalHours });
    console.log('Webhook: created report item', reportItemId, 'from', items.length, 'lesson(s)');

    await uploadFileToColumn(
      reportItemId,
      'file_mm4sd076',
      pdfBuffer,
      `דיווח_${studentName}_${teacherName}.pdf`,
      'application/pdf'
    );

    res.json({ success: true, reportItemId, lessonsIncluded: items.length, totalHours });
  } catch (err) {
    if (browser) await browser.close();
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || process.env.WEBHOOK_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Allowed frontend origin: ${allowedOrigin}`);
});
