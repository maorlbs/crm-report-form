import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import puppeteer from 'puppeteer';
import {
  executeGraphQL,
  findItemIdByName,
  findTeacherByEmail,
  getStudentsForTeacher,
  createLessonItem,
  createReportItem,
  decrementStudentLessonsRemaining,
  getAssetPublicUrls,
  uploadFileToColumn,
  TEACHER_BOARD_ID,
  STUDENT_BOARD_ID,
  REPORT_BOARD_ID,
} from './monday-client.js';
import { buildReportHtml } from './report-template.js';

const upload = multer({ storage: multer.memoryStorage() });

const app = express();

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5183';
app.use(cors({ origin: allowedOrigin }));
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

// --- App API ---------------------------------------------------------------

app.post('/api/login', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim();
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const teacher = await findTeacherByEmail(email);
    if (!teacher) {
      return res.status(404).json({ error: 'לא נמצא מורה עם האימייל הזה במערכת' });
    }

    const students = await getStudentsForTeacher(teacher.id);
    res.json({ teacher, students });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'שגיאה בהתחברות למערכת. אנא נסה שנית.' });
  }
});

app.post('/api/lessons', upload.single('signature'), async (req, res) => {
  try {
    const { studentId, studentName, teacherName, date, startHour, startMinute, endHour, endMinute } = req.body;
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

    // Every lesson item created here represents one reported lesson - deduct it
    // from the student's remaining package balance. Don't fail the request over
    // this: the lesson itself is already saved and signed.
    if (studentId) {
      try {
        await decrementStudentLessonsRemaining(studentId);
      } catch (err) {
        console.error('Failed to update lessons remaining for student', studentId, err);
      }
    }

    res.json({ itemId });
  } catch (err) {
    console.error('Create lesson error:', err);
    res.status(500).json({ error: 'שגיאה בשמירת הנתונים. אנא נסה שנית.' });
  }
});

app.post('/api/reports', upload.single('pdf'), async (req, res) => {
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
      findItemIdByName(STUDENT_BOARD_ID, studentName),
    ]);

    // Render the combined report to a real PDF (server-side equivalent of the
    // browser's html2pdf flow)
    const html = buildReportHtml({ studentName, teacherName, reportRows, totalHours });
    // --no-sandbox is required in most containerized hosts (Render, Docker, ...) -
    // Chrome's sandbox needs kernel privileges those containers don't grant, and
    // without this flag the browser can hang instead of erroring cleanly.
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    // 'load' (all resources referenced in the initial HTML finish loading, success
    // or failure) is more reliable here than 'networkidle0', which waits for zero
    // in-flight network connections and can stall on keep-alive connections.
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
