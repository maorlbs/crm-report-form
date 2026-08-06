import { useState } from 'react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Alert, AlertDescription } from '@components/ui/alert';
import { Loader2, Mail, ArrowLeft, User, CalendarDays, FileText } from 'lucide-react';
import { login } from '@api/backend-client';
import ReportForm from '@generated/components/ReportForm';

export default function App() {
  const [step, setStep] = useState('login'); // login | students | reportType | form
  const [email, setEmail] = useState('');
  const [teacher, setTeacher] = useState(null);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [reportType, setReportType] = useState(null); // 'monthly' | 'single'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Handle teacher login
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { teacher: foundTeacher, students: foundStudents } = await login(email.trim());
      setTeacher(foundTeacher);
      setStudents(foundStudents);
      setStep('students');
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'שגיאה בהתחברות למערכת. אנא נסה שנית.');
    } finally {
      setLoading(false);
    }
  };

  // Handle student selection
  const handleSelectStudent = (student) => {
    setSelectedStudent(student);
    setStep('reportType');
  };

  // Handle report type selection
  const handleSelectReportType = (type) => {
    setReportType(type);
    setStep('form');
  };

  // Handle back to students list
  const handleBackToStudents = () => {
    setSelectedStudent(null);
    setReportType(null);
    setStep('students');
  };

  // Handle back to report type selection
  const handleBackToReportType = () => {
    setReportType(null);
    setStep('reportType');
  };

  // Render login screen
  if (step === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--background))] to-[hsl(var(--muted))] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-[hsl(var(--card))] rounded-lg shadow-lg border border-[hsl(var(--border))] p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-[hsl(var(--primary))] rounded-full mb-4">
                <User className="w-8 h-8 text-[hsl(var(--primary-foreground))]" />
              </div>
              <p className="text-sm font-semibold tracking-wide text-[hsl(var(--primary))] mb-1">
                AllTeachers
              </p>
              <h1 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-2">
                טופס דיווח שעות הוראה
              </h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                הזן את כתובת האימייל שלך להתחברות
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="email-input" className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                  אימייל
                </label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[hsl(var(--muted-foreground))]" />
                  <Input
                    id="email-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@mail.com"
                    required
                    disabled={loading}
                    className="pr-10"
                  />
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !email.trim()}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    מתחבר...
                  </>
                ) : (
                  <>
                    <ArrowLeft className="w-4 h-4 ml-2" />
                    התחבר
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Render students list
  if (step === 'students') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--background))] to-[hsl(var(--muted))] p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-[hsl(var(--card))] rounded-lg shadow-lg border border-[hsl(var(--border))] p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-[hsl(var(--foreground))] mb-1">
                  שלום, {teacher?.name}
                </h2>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  בחר תלמיד כדי למלא דיווח שעות
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setStep('login');
                  setTeacher(null);
                  setStudents([]);
                  setEmail('');
                }}
              >
                התנתק
              </Button>
            </div>
          </div>

          {students.length === 0 ? (
            <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] p-12 text-center">
              <p className="text-[hsl(var(--muted-foreground))] text-lg">
                אין תלמידים מקושרים אליך במערכת
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {students.map((student) => (
                <button
                  key={student.id}
                  onClick={() => handleSelectStudent(student)}
                  className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] p-6 text-right hover:border-[hsl(var(--primary))] hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))]">
                      {student.name}
                    </h3>
                    <ArrowLeft className="w-5 h-5 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))] group-hover:-translate-x-1 transition-transform" />
                  </div>
                  <div className="space-y-1 text-sm text-[hsl(var(--muted-foreground))]">
                    {student.column2 && (
                      <p>כיתה: {student.column2}</p>
                    )}
                    {student.column3 && (
                      <p>מקצוע: {student.column3}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render report type selection
  if (step === 'reportType' && selectedStudent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--background))] to-[hsl(var(--muted))] p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-[hsl(var(--card))] rounded-lg shadow-lg border border-[hsl(var(--border))] p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-[hsl(var(--foreground))] mb-1">
                  {selectedStudent.name}
                </h2>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  בחר את סוג הדיווח
                </p>
              </div>
              <Button variant="outline" onClick={handleBackToStudents}>
                חזור לרשימת תלמידים
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <button
              onClick={() => handleSelectReportType('monthly')}
              className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] p-6 text-right hover:border-[hsl(var(--primary))] hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))]">
                  דיווח מרוכז
                </h3>
                <CalendarDays className="w-5 h-5 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))]" />
              </div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                דיווח של מספר שיעורים יחד, כולל יצירת דף חתימות לכל שיעור
              </p>
            </button>

            <button
              onClick={() => handleSelectReportType('single')}
              className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] p-6 text-right hover:border-[hsl(var(--primary))] hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))]">
                  דיווח שיעור בודד
                </h3>
                <FileText className="w-5 h-5 text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--primary))]" />
              </div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                דיווח של שיעור אחד בלבד, ללא יצירת דף חתימות נפרד
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render report form
  if (step === 'form' && selectedStudent && reportType) {
    return (
      <ReportForm
        student={selectedStudent}
        teacher={teacher}
        reportType={reportType}
        onBack={handleBackToReportType}
      />
    );
  }

  return null;
}
