const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function parseJsonOrThrow(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(email, password) {
  const response = await fetch(`${API_BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return parseJsonOrThrow(response);
}

export async function resetPassword(token, currentPassword, newPassword) {
  const response = await fetch(`${API_BASE_URL}/api/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  return parseJsonOrThrow(response);
}

export async function createLesson(token, { studentId, studentName, teacherId, teacherName, date, startHour, startMinute, endHour, endMinute, signatureFile }) {
  const formData = new FormData();
  formData.append('studentId', studentId ?? '');
  formData.append('studentName', studentName);
  formData.append('teacherId', teacherId ?? '');
  formData.append('teacherName', teacherName);
  formData.append('date', date);
  formData.append('startHour', startHour);
  formData.append('startMinute', startMinute);
  formData.append('endHour', endHour);
  formData.append('endMinute', endMinute);
  formData.append('signature', signatureFile);

  const response = await fetch(`${API_BASE_URL}/api/lessons`, {
    method: 'POST',
    headers: authHeaders(token),
    body: formData,
  });
  return parseJsonOrThrow(response);
}

// --- Admin -----------------------------------------------------------------

export async function listTeachers(token) {
  const response = await fetch(`${API_BASE_URL}/api/admin/teachers`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow(response);
}

export async function resetTeacherPassword(token, teacherId, newPassword) {
  const response = await fetch(`${API_BASE_URL}/api/admin/teachers/${teacherId}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ newPassword }),
  });
  return parseJsonOrThrow(response);
}

export async function actAsTeacher(token, teacherId) {
  const response = await fetch(`${API_BASE_URL}/api/admin/act-as/${teacherId}`, {
    headers: authHeaders(token),
  });
  return parseJsonOrThrow(response);
}
