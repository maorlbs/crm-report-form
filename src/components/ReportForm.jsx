import { useState } from 'react';
import { Plus, Save, Trash2, ArrowRight, CheckCircle2 } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Alert, AlertDescription } from '@components/ui/alert';
import SignaturePad from '@generated/components/SignaturePad';
import { createLesson, createReport } from '@api/backend-client';

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export default function ReportForm({ student, teacher, reportType, onBack }) {
  const [rows, setRows] = useState([
    {
      id: crypto.randomUUID(),
      date: '',
      startTime: '',
      endTime: '',
      signature: null
    }
  ]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const addRow = () => {
    setRows([
      ...rows,
      {
        id: crypto.randomUUID(),
        date: '',
        startTime: '',
        endTime: '',
        signature: null
      }
    ]);
  };

  const removeRow = (id) => {
    if (rows.length > 1) {
      setRows(rows.filter((row) => row.id !== id));
    }
  };

  const updateRow = (id, field, value) => {
    setRows(rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      // Validate all rows
      for (const row of rows) {
        if (!row.date || !row.startTime || !row.endTime) {
          setError('יש למלא את כל השדות בכל השורות');
          setSaving(false);
          return;
        }
        if (!row.signature) {
          setError('יש לחתום בכל השורות');
          setSaving(false);
          return;
        }
      }

      // Calculate total hours and build report data (incl. a data-URL copy of
      // each row's signature so it can be embedded directly in the HTML report)
      let totalHours = 0;
      const reportRows = [];

      for (const row of rows) {
        const [startHour, startMinute] = row.startTime.split(':').map(Number);
        const [endHour, endMinute] = row.endTime.split(':').map(Number);

        // Calculate hours for this lesson
        const startInMinutes = startHour * 60 + startMinute;
        const endInMinutes = endHour * 60 + endMinute;
        const durationMinutes = endInMinutes - startInMinutes;
        const hours = durationMinutes / 60;
        totalHours += hours;

        const signatureDataUrl = await fileToDataUrl(row.signature);

        reportRows.push({
          date: row.date,
          startTime: row.startTime,
          endTime: row.endTime,
          hours: hours.toFixed(2),
          signatureDataUrl
        });
      }

      // Single lesson: one item on the lesson board (5101665472) only, with
      // its own raw signature file and a direct student link. No PDF, nothing
      // on the summary/signature-pages board.
      if (reportType === 'single') {
        const row = rows[0];
        const [startHour, startMinute] = row.startTime.split(':').map(Number);
        const [endHour, endMinute] = row.endTime.split(':').map(Number);

        const { itemId } = await createLesson({
          studentId: student.id,
          studentName: student.name,
          teacherName: teacher.name,
          date: row.date,
          startHour,
          startMinute,
          endHour,
          endMinute,
          signatureFile: row.signature
        });

        console.log('Created single-lesson item:', itemId);

        setSuccess(true);
        setTimeout(() => {
          setRows([
            {
              id: crypto.randomUUID(),
              date: '',
              startTime: '',
              endTime: '',
              signature: null
            }
          ]);
          setSuccess(false);
        }, 2000);
        return;
      }

      // Monthly: a per-lesson item on the lesson board (5101665472) for every
      // row, plus one aggregate item + combined PDF on the summary board
      // (5099392418).
      for (const row of rows) {
        const [startHour, startMinute] = row.startTime.split(':').map(Number);
        const [endHour, endMinute] = row.endTime.split(':').map(Number);

        const { itemId } = await createLesson({
          studentId: student.id,
          studentName: student.name,
          teacherName: teacher.name,
          date: row.date,
          startHour,
          startMinute,
          endHour,
          endMinute,
          signatureFile: row.signature
        });

        console.log('Created lesson item:', itemId);
      }

      // Build the report as an offscreen DOM node and render it to a real
      // PDF (instead of a raw .html file) so monday.com's file preview pane
      // can display it inline.
      const reportContainer = document.createElement('div');
      // position: absolute (not a large negative offset) keeps it out of page
      // flow while still laying out normally - extreme off-screen coordinates
      // confuse html2canvas's measurement. z-index (not opacity) keeps it out
      // of view - html2canvas paints opacity:0 as literal transparency, which
      // produces a blank captured page.
      reportContainer.style.position = 'absolute';
      reportContainer.style.top = '0';
      reportContainer.style.left = '0';
      reportContainer.style.width = '800px';
      reportContainer.style.pointerEvents = 'none';
      reportContainer.style.zIndex = '-1';
      reportContainer.dir = 'rtl';
      // Inline styles on every element instead of a <style> block - html2canvas
      // is known to sometimes drop or mis-apply <style> tags nested inside the
      // element it's capturing, which silently collapses the render to 0 height.
      const thStyle = 'background:#f3f4f6;padding:12px;border:1px solid #d1d5db;font-weight:bold;';
      const tdStyle = 'padding:10px;border:1px solid #d1d5db;text-align:center;';
      reportContainer.innerHTML = `
        <div style="font-family: Arial, sans-serif; padding: 40px; direction: rtl; background: #ffffff;">
          <h1 style="text-align: center; color: #1f2937; margin: 0 0 10px 0; font-size: 24px;">דיווחי שעות - ${student.name}</h1>
          <h2 style="color: #4b5563; margin: 20px 0; font-size: 16px; font-weight: normal;">שם המורה: ${teacher.name}</h2>
          <h3 style="margin: 20px 0 10px 0; font-size: 15px;">דיווח מפורט:</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr>
                <th style="${thStyle}">תאריך</th>
                <th style="${thStyle}">שעת התחלה</th>
                <th style="${thStyle}">שעת סיום</th>
                <th style="${thStyle}">שעות</th>
                <th style="${thStyle}">חתימה</th>
              </tr>
            </thead>
            <tbody>
              ${reportRows.map(row => `
                <tr>
                  <td style="${tdStyle}">${row.date}</td>
                  <td style="${tdStyle}">${row.startTime}</td>
                  <td style="${tdStyle}">${row.endTime}</td>
                  <td style="${tdStyle}">${row.hours}</td>
                  <td style="${tdStyle}"><img src="${row.signatureDataUrl}" alt="חתימה" style="height: 40px; display: inline-block;" /></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="font-size: 18px; font-weight: bold; margin-top: 20px; text-align: right;">סה"כ שעות: ${totalHours.toFixed(2)}</div>
        </div>
      `;
      document.body.appendChild(reportContainer);

      // Let the browser complete a layout + paint pass, and let the embedded
      // signature <img> data URLs finish decoding, before html2canvas measures
      // the container - otherwise it can capture it mid-layout at height 0.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(
        Array.from(reportContainer.querySelectorAll('img')).map((img) =>
          img.decode().catch(() => {})
        )
      );

      // html2canvas's own auto-detected size for this element is unreliable in
      // some environments - measure it ourselves and pass explicit dimensions.
      const reportRect = reportContainer.getBoundingClientRect();

      const pdfBlob = await html2pdf()
        .from(reportContainer)
        .set({
          margin: 10,
          html2canvas: {
            scale: 2,
            useCORS: true,
            width: reportRect.width,
            height: reportContainer.scrollHeight,
            windowWidth: reportRect.width,
            windowHeight: reportContainer.scrollHeight
          },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        })
        .outputPdf('blob');

      document.body.removeChild(reportContainer);

      const pdfFile = new File([pdfBlob], `דיווח_${student.name}_${teacher.name}.pdf`, { type: 'application/pdf' });

      const { reportItemId } = await createReport({
        studentId: student.id,
        studentName: student.name,
        teacherId: teacher.id,
        teacherName: teacher.name,
        totalHours,
        pdfFile
      });

      console.log('Created report item:', reportItemId);

      setSuccess(true);
      // Reset form after 2 seconds
      setTimeout(() => {
        setRows([
          {
            id: crypto.randomUUID(),
            date: '',
            startTime: '',
            endTime: '',
            signature: null
          }
        ]);
        setSuccess(false);
      }, 2000);
    } catch (err) {
      console.error('Error saving data:', err);
      setError('שגיאה בשמירת הנתונים. אנא נסה שנית.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--background))] to-[hsl(var(--muted))] p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-[hsl(var(--card))] rounded-lg shadow-lg border border-[hsl(var(--border))] p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-1">
                דיווח שעות - {student.name}
              </h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {student.column2 && `כיתה ${student.column2}`}
                {student.column3 && ` • ${student.column3}`}
              </p>
            </div>
            <Button variant="outline" onClick={onBack}>
              חזור לבחירת סוג דיווח
            </Button>
          </div>
        </div>

        {/* Form */}
        <div className="bg-[hsl(var(--card))] rounded-lg shadow-lg border border-[hsl(var(--border))] overflow-hidden">
          <form onSubmit={handleSubmit}>
            {/* Table layout - medium screens and up */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full" dir="rtl">
                <thead className="bg-[hsl(var(--muted))] border-b border-[hsl(var(--border))]">
                  <tr>
                    <th className="p-3 text-right text-sm font-semibold text-[hsl(var(--foreground))]">
                      תאריך
                    </th>
                    <th className="p-3 text-right text-sm font-semibold text-[hsl(var(--foreground))]">
                      שעת התחלה
                    </th>
                    <th className="p-3 text-right text-sm font-semibold text-[hsl(var(--foreground))]">
                      שעת סיום
                    </th>
                    <th className="p-3 text-right text-sm font-semibold text-[hsl(var(--foreground))]">
                      חתימה
                    </th>
                    <th className="w-12 p-3">
                      <span className="sr-only">פעולות</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border))]">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-[hsl(var(--muted))]/50">
                      {/* Date */}
                      <td className="p-3">
                        <Input
                          type="date"
                          value={row.date}
                          onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                          required
                          className="w-full"
                        />
                      </td>

                      {/* Start Time */}
                      <td className="p-3">
                        <Input
                          type="time"
                          value={row.startTime}
                          onChange={(e) => updateRow(row.id, 'startTime', e.target.value)}
                          required
                          className="w-full"
                        />
                      </td>

                      {/* End Time */}
                      <td className="p-3">
                        <Input
                          type="time"
                          value={row.endTime}
                          onChange={(e) => updateRow(row.id, 'endTime', e.target.value)}
                          required
                          className="w-full"
                        />
                      </td>

                      {/* Signature */}
                      <td className="p-3">
                        <SignaturePad
                          hasSignature={!!row.signature}
                          onSave={(file) => updateRow(row.id, 'signature', file)}
                          onClear={() => updateRow(row.id, 'signature', null)}
                        />
                      </td>

                      {/* Remove Button */}
                      <td className="p-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRow(row.id)}
                          disabled={rows.length === 1}
                          className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Card layout - mobile */}
            <div className="md:hidden divide-y divide-[hsl(var(--border))]" dir="rtl">
              {rows.map((row, index) => (
                <div key={row.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                      שיעור {index + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}
                      className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">
                      תאריך
                    </label>
                    <Input
                      type="date"
                      value={row.date}
                      onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">
                      שעת התחלה
                    </label>
                    <Input
                      type="time"
                      value={row.startTime}
                      onChange={(e) => updateRow(row.id, 'startTime', e.target.value)}
                      required
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">
                      שעת סיום
                    </label>
                    <Input
                      type="time"
                      value={row.endTime}
                      onChange={(e) => updateRow(row.id, 'endTime', e.target.value)}
                      required
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[hsl(var(--muted-foreground))] mb-1">
                      חתימה
                    </label>
                    <SignaturePad
                      hasSignature={!!row.signature}
                      onSave={(file) => updateRow(row.id, 'signature', file)}
                      onClear={() => updateRow(row.id, 'signature', null)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30">
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                {reportType === 'monthly' ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addRow}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    הוסף שורה
                  </Button>
                ) : (
                  <div />
                )}

                <div className="flex gap-3">
                  {success && (
                    <Alert className="flex-1 py-2 bg-green-50 border-green-200">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800 mr-6">
                        הדיווח נשמר בהצלחה!
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    disabled={saving || rows.length === 0}
                    className="gap-2 min-w-32"
                  >
                    {saving ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        שומר...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        שמור דיווח
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {error && (
                <Alert variant="destructive" className="mt-3">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
