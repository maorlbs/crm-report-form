import { useState } from 'react';
import { Plus, Save, Trash2, CheckCircle2 } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Alert, AlertDescription } from '@components/ui/alert';
import SignaturePad from '@generated/components/SignaturePad';
import { createLesson } from '@api/backend-client';

const emptyRow = () => ({
  id: crypto.randomUUID(),
  date: '',
  startTime: '',
  endTime: '',
  signature: null
});

export default function ReportForm({ student, teacher, reportType, token, onBack }) {
  const [rows, setRows] = useState([emptyRow()]);
  // Consolidated ("מרוכז") reports use one shared signature for every lesson
  // in the batch instead of a signature per row.
  const [sharedSignature, setSharedSignature] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const isConsolidated = reportType === 'monthly';

  const addRow = () => {
    setRows((prevRows) => [...prevRows, emptyRow()]);
  };

  const removeRow = (id) => {
    if (rows.length > 1) {
      setRows(rows.filter((row) => row.id !== id));
    }
  };

  const updateRow = (id, field, value) => {
    setRows(rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const resetForm = () => {
    setRows([emptyRow()]);
    setSharedSignature(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      for (const row of rows) {
        if (!row.date || !row.startTime || !row.endTime) {
          setError('יש למלא את כל השדות בכל השורות');
          setSaving(false);
          return;
        }
        if (!isConsolidated && !row.signature) {
          setError('יש לחתום בכל השורות');
          setSaving(false);
          return;
        }
      }

      if (isConsolidated && !sharedSignature) {
        setError('יש לחתום על הדיווח');
        setSaving(false);
        return;
      }

      // Every lesson becomes its own item on the lesson board - a single-lesson
      // report is just one of these, a consolidated report is several, all
      // sharing the same signature file.
      for (const row of rows) {
        const [startHour, startMinute] = row.startTime.split(':').map(Number);
        const [endHour, endMinute] = row.endTime.split(':').map(Number);

        const { itemId } = await createLesson(token, {
          studentId: student.id,
          studentName: student.name,
          teacherName: teacher.name,
          date: row.date,
          startHour,
          startMinute,
          endHour,
          endMinute,
          signatureFile: isConsolidated ? sharedSignature : row.signature
        });

        console.log('Created lesson item:', itemId);
      }

      setSuccess(true);
      setTimeout(() => {
        resetForm();
        setSuccess(false);
      }, 2000);
    } catch (err) {
      console.error('Error saving data:', err);
      setError(err.message || 'שגיאה בשמירת הנתונים. אנא נסה שנית.');
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
                    {!isConsolidated && (
                      <th className="p-3 text-right text-sm font-semibold text-[hsl(var(--foreground))]">
                        חתימה
                      </th>
                    )}
                    {isConsolidated && (
                      <th className="w-12 p-3">
                        <span className="sr-only">פעולות</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border))]">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-[hsl(var(--muted))]/50">
                      <td className="p-3">
                        <Input
                          type="date"
                          value={row.date}
                          onChange={(e) => updateRow(row.id, 'date', e.target.value)}
                          required
                          className="w-full"
                        />
                      </td>

                      <td className="p-3">
                        <Input
                          type="time"
                          value={row.startTime}
                          onChange={(e) => updateRow(row.id, 'startTime', e.target.value)}
                          required
                          className="w-full"
                        />
                      </td>

                      <td className="p-3">
                        <Input
                          type="time"
                          value={row.endTime}
                          onChange={(e) => updateRow(row.id, 'endTime', e.target.value)}
                          required
                          className="w-full"
                        />
                      </td>

                      {!isConsolidated && (
                        <td className="p-3">
                          <SignaturePad
                            hasSignature={!!row.signature}
                            onSave={(file) => updateRow(row.id, 'signature', file)}
                            onClear={() => updateRow(row.id, 'signature', null)}
                          />
                        </td>
                      )}

                      {isConsolidated && (
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
                      )}
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
                    {isConsolidated && (
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
                    )}
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

                  {!isConsolidated && (
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
                  )}
                </div>
              ))}
            </div>

            {/* Shared signature - consolidated reports only */}
            {isConsolidated && (
              <div className="p-4 border-t border-[hsl(var(--border))]" dir="rtl">
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                  חתימה מרוכזת (עבור כל השיעורים בדיווח זה)
                </label>
                <SignaturePad
                  hasSignature={!!sharedSignature}
                  onSave={(file) => setSharedSignature(file)}
                  onClear={() => setSharedSignature(null)}
                />
              </div>
            )}

            <div className="p-6 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30">
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                {isConsolidated ? (
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
