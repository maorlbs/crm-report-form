import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Alert, AlertDescription } from '@components/ui/alert';
import StatCard from './StatCard';
import { getAdminSummary, downloadReport } from '@api/backend-client';
import { formatMinutes, currentMonth, hoursDelta } from './dashboard-utils';

// Full picture for admins: every teacher and every student reported on in the
// chosen month, with monthly PDF reports (general / per teacher / per student).
export default function AdminOverview({ token, teacherList, onOpenTeacher }) {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getAdminSummary(token, month)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'שגיאה בטעינת הנתונים');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, month]);

  const teacherIdByName = Object.fromEntries(teacherList.map((t) => [t.name, t.id]));

  const download = async (key, params) => {
    setBusyKey(key);
    setError('');
    try {
      await downloadReport(token, '/api/admin/report.pdf', { month, ...params });
    } catch (err) {
      setError(err.message || 'שגיאה ביצירת הדוח');
    } finally {
      setBusyKey(null);
    }
  };

  const ExportButtons = ({ id, params, disabled }) => (
    <>
      {[['pdf', 'PDF', Download], ['xlsx', 'Excel', FileSpreadsheet]].map(([format, label, Icon]) => (
        <Button
          key={format}
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={disabled || busyKey !== null}
          onClick={() => download(`${id}-${format}`, { ...params, format })}
        >
          {busyKey === `${id}-${format}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
          {label}
        </Button>
      ))}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="admin-month" className="text-sm font-medium text-[hsl(var(--foreground))]">
            חודש
          </label>
          <Input
            id="admin-month"
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            className="gap-2"
            disabled={busyKey !== null || loading}
            onClick={() => download('all-pdf', { scope: 'all', format: 'pdf' })}
          >
            {busyKey === 'all-pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            דוח חודשי כללי (PDF)
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            disabled={busyKey !== null || loading}
            onClick={() => download('all-xlsx', { scope: 'all', format: 'xlsx' })}
          >
            {busyKey === 'all-xlsx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            דוח חודשי כללי (Excel)
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && !data ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--muted-foreground))]" />
        </div>
      ) : (
        data && (
          <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
              <StatCard
                label="שעות החודש"
                value={formatMinutes(data.totals.minutes)}
                hint={hoursDelta(data.totals.minutes, data.previousTotals.minutes)}
              />
              <StatCard label="שיעורים" value={data.totals.lessons} />
              <StatCard label="מורים פעילים" value={data.totals.teachers} />
              <StatCard label="תלמידים" value={data.totals.students} />
            </div>

            <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] overflow-hidden">
              <h3 className="font-semibold text-[hsl(var(--foreground))] p-4 pb-2">מורים</h3>
              {data.byTeacher.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))] p-4 pt-0">אין דיווחים בחודש זה</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" dir="rtl">
                    <thead className="bg-[hsl(var(--muted))]">
                      <tr>
                        <th className="p-3 text-right font-semibold">מורה</th>
                        <th className="p-3 text-right font-semibold">תלמידים</th>
                        <th className="p-3 text-right font-semibold">שיעורים</th>
                        <th className="p-3 text-right font-semibold">שעות</th>
                        <th className="p-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))]">
                      {data.byTeacher.map((t) => {
                        const teacherId = teacherIdByName[t.name];
                        return (
                          <tr key={t.name}>
                            <td className="p-3">{t.name}</td>
                            <td className="p-3">{t.students}</td>
                            <td className="p-3">{t.lessons}</td>
                            <td className="p-3 whitespace-nowrap">{formatMinutes(t.minutes)}</td>
                            <td className="p-3">
                              <div className="flex gap-2 justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={!teacherId}
                                  onClick={() => onOpenTeacher({ id: teacherId, name: t.name })}
                                >
                                  פירוט
                                </Button>
                                <ExportButtons id={`t-${t.name}`} params={{ scope: 'teacher', teacherId }} disabled={!teacherId} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] overflow-hidden">
              <h3 className="font-semibold text-[hsl(var(--foreground))] p-4 pb-2">תלמידים</h3>
              {data.byStudent.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))] p-4 pt-0">אין דיווחים בחודש זה</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" dir="rtl">
                    <thead className="bg-[hsl(var(--muted))]">
                      <tr>
                        <th className="p-3 text-right font-semibold">תלמיד</th>
                        <th className="p-3 text-right font-semibold">מורה</th>
                        <th className="p-3 text-right font-semibold">שיעורים</th>
                        <th className="p-3 text-right font-semibold">שעות</th>
                        <th className="p-3 text-right font-semibold">שיעורים שנותרו</th>
                        <th className="p-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))]">
                      {data.byStudent.map((s) => (
                        <tr key={s.key}>
                          <td className="p-3">{s.name}</td>
                          <td className="p-3">{s.teachers.join(', ')}</td>
                          <td className="p-3">{s.lessons}</td>
                          <td className="p-3 whitespace-nowrap">{formatMinutes(s.minutes)}</td>
                          <td className="p-3">{s.remaining ?? '—'}</td>
                          <td className="p-3">
                            <div className="flex justify-end">
                              <ExportButtons id={`s-${s.key}`} params={{ scope: 'student', studentKey: s.key }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
