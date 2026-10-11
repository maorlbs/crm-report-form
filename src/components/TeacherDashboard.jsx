import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Alert, AlertDescription } from '@components/ui/alert';
import StatCard from './StatCard';
import { formatMinutes, currentMonth, hoursDelta, formatDate, lessonsLabel } from './dashboard-utils';

// A teacher's history + monthly dashboard. Used for the teacher's own view
// and, with showRemaining, for an admin looking at one teacher.
export default function TeacherDashboard({ loadSummary, onDownload, showRemaining = false }) {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(null); // 'pdf' | 'xlsx' | null
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    loadSummary(month)
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
    // loadSummary is recreated on every render of the parent; the month drives reloads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const handleDownload = async (format) => {
    setDownloading(format);
    setError('');
    try {
      await onDownload(month, format);
    } catch (err) {
      setError(err.message || 'שגיאה ביצירת הדוח');
    } finally {
      setDownloading(null);
    }
  };

  const maxMinutes = Math.max(1, ...(data?.byStudent || []).map((s) => s.minutes));

  return (
    <div className="space-y-4">
      <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="dash-month" className="text-sm font-medium text-[hsl(var(--foreground))]">
            חודש
          </label>
          <Input
            id="dash-month"
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => handleDownload('pdf')} disabled={downloading !== null || loading} className="gap-2">
            {downloading === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            דוח חודשי (PDF)
          </Button>
          <Button variant="outline" onClick={() => handleDownload('xlsx')} disabled={downloading !== null || loading} className="gap-2">
            {downloading === 'xlsx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            דוח חודשי (Excel)
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
          <>
            <div className={`grid gap-3 grid-cols-1 sm:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
              <StatCard
                label="שעות החודש"
                value={formatMinutes(data.totals.minutes)}
                hint={hoursDelta(data.totals.minutes, data.previousTotals.minutes)}
              />
              <StatCard label="שיעורים" value={data.totals.lessons} />
              <StatCard label="תלמידים" value={data.totals.students} />
            </div>

            <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] p-4">
              <h3 className="font-semibold text-[hsl(var(--foreground))] mb-3">שעות לפי תלמיד</h3>
              {data.byStudent.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">אין דיווחים בחודש זה</p>
              ) : (
                <div className="space-y-3">
                  {data.byStudent.map((s) => (
                    <div key={s.key}>
                      <div className="flex items-center justify-between text-sm mb-1 gap-2">
                        <span className="text-[hsl(var(--foreground))]">
                          {s.name}
                          {showRemaining && s.remaining !== null && s.remaining !== undefined && (
                            <span className="mr-2 text-xs px-2 py-0.5 rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                              נותרו {s.remaining}
                            </span>
                          )}
                        </span>
                        <span className="text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                          {formatMinutes(s.minutes)} שעות · {lessonsLabel(s.lessons)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[hsl(var(--primary))]"
                          style={{ width: `${(s.minutes / maxMinutes) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] overflow-hidden">
              <h3 className="font-semibold text-[hsl(var(--foreground))] p-4 pb-2">היסטוריית דיווחים</h3>
              {data.lessons.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))] p-4 pt-0">אין דיווחים בחודש זה</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" dir="rtl">
                    <thead className="bg-[hsl(var(--muted))]">
                      <tr>
                        <th className="p-3 text-right font-semibold">תאריך</th>
                        <th className="p-3 text-right font-semibold">תלמיד</th>
                        <th className="p-3 text-right font-semibold">שעות</th>
                        <th className="p-3 text-right font-semibold">משך</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))]">
                      {data.lessons.map((l) => (
                        <tr key={l.id}>
                          <td className="p-3 whitespace-nowrap">{formatDate(l.date)}</td>
                          <td className="p-3">{l.studentName}</td>
                          <td className="p-3 whitespace-nowrap">
                            {l.start}–{l.end}
                          </td>
                          <td className="p-3 whitespace-nowrap">{formatMinutes(l.minutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}
