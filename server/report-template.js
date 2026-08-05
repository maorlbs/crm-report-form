export function buildReportHtml({ studentName, teacherName, reportRows, totalHours }) {
  const thStyle = 'background:#f3f4f6;padding:12px;border:1px solid #d1d5db;font-weight:bold;';
  const tdStyle = 'padding:10px;border:1px solid #d1d5db;text-align:center;';

  return `
    <!doctype html>
    <html dir="rtl" lang="he">
    <head><meta charset="UTF-8" /></head>
    <body style="margin:0;">
      <div style="font-family: Arial, sans-serif; padding: 40px; direction: rtl; background: #ffffff;">
        <h1 style="text-align: center; color: #1f2937; margin: 0 0 10px 0; font-size: 24px;">דיווחי שעות - ${studentName}</h1>
        <h2 style="color: #4b5563; margin: 20px 0; font-size: 16px; font-weight: normal;">שם המורה: ${teacherName}</h2>
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
            ${reportRows
              .map(
                (row) => `
              <tr>
                <td style="${tdStyle}">${row.date}</td>
                <td style="${tdStyle}">${row.startTime}</td>
                <td style="${tdStyle}">${row.endTime}</td>
                <td style="${tdStyle}">${row.hours}</td>
                <td style="${tdStyle}">${row.signatureUrl ? `<img src="${row.signatureUrl}" alt="חתימה" style="height: 40px;" />` : ''}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
        <div style="font-size: 18px; font-weight: bold; margin-top: 20px; text-align: right;">סה"כ שעות: ${totalHours.toFixed(2)}</div>
      </div>
    </body>
    </html>
  `;
}
