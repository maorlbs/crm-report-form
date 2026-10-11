// Pure aggregation over normalised lessons (see fetchAllLessons).

export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function formatClock(minutes) {
  if (minutes === null || minutes === undefined) return '';
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function previousMonth(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function isValidMonth(month) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month || '');
}

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function totals(lessons) {
  return {
    lessons: lessons.length,
    minutes: lessons.reduce((sum, l) => sum + l.minutes, 0),
    students: new Set(lessons.map((l) => l.studentKey)).size,
    teachers: new Set(lessons.map((l) => l.teacherName)).size,
  };
}

function groupBy(lessons, keyOf) {
  const groups = new Map();
  for (const lesson of lessons) {
    const key = keyOf(lesson);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(lesson);
  }
  return groups;
}

export function byStudent(lessons) {
  return [...groupBy(lessons, (l) => l.studentKey).entries()]
    .map(([key, group]) => ({
      key,
      studentId: group[0].studentId,
      name: group[0].studentName,
      teachers: [...new Set(group.map((l) => l.teacherName).filter(Boolean))],
      lessons: group.length,
      minutes: group.reduce((sum, l) => sum + l.minutes, 0),
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

export function byTeacher(lessons) {
  return [...groupBy(lessons, (l) => l.teacherName || '—').entries()]
    .map(([name, group]) => ({
      name,
      lessons: group.length,
      students: new Set(group.map((l) => l.studentKey)).size,
      minutes: group.reduce((sum, l) => sum + l.minutes, 0),
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

export function sortLessons(lessons) {
  return [...lessons].sort((a, b) => (a.date === b.date ? (a.startMinutes ?? 0) - (b.startMinutes ?? 0) : a.date < b.date ? 1 : -1));
}

export function publicLesson(l) {
  return {
    id: l.id,
    date: l.date,
    start: formatClock(l.startMinutes),
    end: formatClock(l.endMinutes),
    minutes: l.minutes,
    teacherName: l.teacherName,
    studentKey: l.studentKey,
    studentId: l.studentId,
    studentName: l.studentName,
  };
}

// Summary used by both the teacher dashboard and the admin overview.
export function buildSummary(allLessons, month, filter = () => true) {
  const scoped = allLessons.filter(filter);
  const current = scoped.filter((l) => l.month === month);
  const previous = scoped.filter((l) => l.month === previousMonth(month));
  return {
    month,
    totals: totals(current),
    previousTotals: totals(previous),
    byStudent: byStudent(current),
    byTeacher: byTeacher(current),
    lessons: sortLessons(current).map(publicLesson),
  };
}
