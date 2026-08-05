const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function parseJsonOrThrow(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export async function login(email) {
  const response = await fetch(`${API_BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return parseJsonOrThrow(response);
}

export async function createLesson({ studentId, studentName, teacherName, date, startHour, startMinute, endHour, endMinute, signatureFile }) {
  const formData = new FormData();
  formData.append('studentId', studentId ?? '');
  formData.append('studentName', studentName);
  formData.append('teacherName', teacherName);
  formData.append('date', date);
  formData.append('startHour', startHour);
  formData.append('startMinute', startMinute);
  formData.append('endHour', endHour);
  formData.append('endMinute', endMinute);
  formData.append('signature', signatureFile);

  const response = await fetch(`${API_BASE_URL}/api/lessons`, {
    method: 'POST',
    body: formData,
  });
  return parseJsonOrThrow(response);
}

export async function createReport({ studentId, studentName, teacherId, teacherName, totalHours, pdfFile }) {
  const formData = new FormData();
  formData.append('studentId', studentId ?? '');
  formData.append('studentName', studentName);
  formData.append('teacherId', teacherId ?? '');
  formData.append('teacherName', teacherName);
  formData.append('totalHours', totalHours);
  formData.append('pdf', pdfFile);

  const response = await fetch(`${API_BASE_URL}/api/reports`, {
    method: 'POST',
    body: formData,
  });
  return parseJsonOrThrow(response);
}
