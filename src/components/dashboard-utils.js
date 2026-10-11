export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// "+2:30 לעומת חודש קודם" / "-1:00 ..." / null when there is no comparison
export function hoursDelta(currentMinutes, previousMinutes) {
  if (!previousMinutes) return null;
  const diff = currentMinutes - previousMinutes;
  if (diff === 0) return 'ללא שינוי לעומת החודש הקודם';
  return `${diff > 0 ? '+' : '-'}${formatMinutes(Math.abs(diff))} לעומת החודש הקודם`;
}

export function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function lessonsLabel(count) {
  return count === 1 ? 'שיעור אחד' : `${count} שיעורים`;
}
