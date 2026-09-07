import { useState } from 'react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Alert, AlertDescription } from '@components/ui/alert';
import { Loader2, Mail, Lock, ArrowLeft, User, CalendarDays, FileText, ShieldCheck, KeyRound } from 'lucide-react';
import { login, resetPassword, listTeachers, resetTeacherPassword, actAsTeacher } from '@api/backend-client';
import ReportForm from '@generated/components/ReportForm';

export default function App() {
  // login | resetPassword | adminDashboard | students | reportType | form
  const [step, setStep] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(null);
  const [role, setRole] = useState(null); // 'teacher' | 'admin'
  const [teacher, setTeacher] = useState(null);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [reportType, setReportType] = useState(null); // 'monthly' | 'single'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Admin-only state
  const [teacherList, setTeacherList] = useState([]);
  const [actingAsAdmin, setActingAsAdmin] = useState(false); // true while admin is signing hours on behalf of a teacher

  // New-password fields, used on the forced reset screen
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const resetToLogin = () => {
    setStep('login');
    setToken(null);
    setRole(null);
    setTeacher(null);
    setStudents([]);
    setEmail('');
    setPassword('');
    setActingAsAdmin(false);
  };

  const proceedAfterAuth = (data) => {
    setToken(data.token);
    setRole(data.role);
    setTeacher(data.teacher);
    setStudents(data.students || []);

    if (data.mustResetPassword) {
      setStep('resetPassword');
    } else if (data.role === 'admin') {
      loadTeacherList(data.token);
    } else {
      setStep('students');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await login(email.trim(), password);
      proceedAfterAuth(data);
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'שגיאה בהתחברות למערכת. אנא נסה שנית.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('הסיסמה החדשה חייבת להכיל לפחות 6 תווים');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password, newPassword);
      setPassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      if (role === 'admin') {
        await loadTeacherList(token);
      } else {
        setStep('students');
      }
    } catch (err) {
      console.error('Reset password error:', err);
      setError(err.message || 'שגיאה באיפוס הסיסמה. אנא נסה שנית.');
    } finally {
      setLoading(false);
    }
  };

  const loadTeacherList = async (authToken) => {
    setLoading(true);
    setError('');
    try {
      const data = await listTeachers(authToken);
      setTeacherList(data.teachers || []);
      setStep('adminDashboard');
    } catch (err) {
      console.error('Load teachers error:', err);
      setError(err.message || 'שגיאה בטעינת רשימת המורים');
    } finally {
      setLoading(false);
    }
  };

  const handleResetTeacherPassword = async (teacherId, teacherName) => {
    const newPass = window.prompt(`סיסמה חדשה עבור ${teacherName}:`);
    if (!newPass) return;
    if (newPass.length < 6) {
      window.alert('הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }
    try {
      await resetTeacherPassword(token, teacherId, newPass);
      window.alert(`הסיסמה עודכנה. יש למסור למורה את הסיסמה החדשה: ${newPass}`);
      loadTeacherList(token);
    } catch (err) {
      console.error('Reset teacher password error:', err);
      window.alert(err.message || 'שגיאה באיפוס הסיסמה');
    }
  };

  const handleActAsTeacher = async (teacherId) => {
    setLoading(true);
    setError('');
    try {
      const data = await actAsTeacher(token, teacherId);
      setTeacher(data.teacher);
      setStudents(data.students || []);
      setActingAsAdmin(true);
      setStep('students');
    } catch (err) {
      console.error('Act as teacher error:', err);
      setError(err.message || 'שגיאה בטעינת נתוני המורה');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStudent = (student) => {
    setSelectedStudent(student);
    setStep('reportType');
  };

  const handleSelectReportType = (type) => {
    setReportType(type);
    setStep('form');
  };

  const handleBackToStudents = () => {
    setSelectedStudent(null);
    setReportType(null);
    setStep('students');
  };

  const handleBackToReportType = () => {
    setReportType(null);
    setStep('reportType');
  };

  const handleBackToAdminDashboard = () => {
    setSelectedStudent(null);
    setReportType(null);
    setStudents([]);
    setActingAsAdmin(false);
    setStep('adminDashboard');
  };

  // --- Login screen ---------------------------------------------------

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
                הזן אימייל וסיסמה להתחברות
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

              <div>
                <label htmlFor="password-input" className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                  סיסמה
                </label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[hsl(var(--muted-foreground))]" />
                  <Input
                    id="password-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="הסיסמה שלך"
                    required
                    disabled={loading}
                    className="pr-10"
                  />
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                  בכניסה ראשונה, הסיסמה היא מספר הטלפון שלך כפי שמופיע במערכת
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={loading || !email.trim() || !password}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    מתחבר...
                  </>
                ) : (
                  <>
                    התחבר
                    <ArrowLeft className="w-4 h-4 mr-2" />
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // --- Forced password reset screen ------------------------------------

  if (step === 'resetPassword') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--background))] to-[hsl(var(--muted))] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-[hsl(var(--card))] rounded-lg shadow-lg border border-[hsl(var(--border))] p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-[hsl(var(--primary))] rounded-full mb-4">
                <KeyRound className="w-8 h-8 text-[hsl(var(--primary-foreground))]" />
              </div>
              <h1 className="text-2xl font-bold text-[hsl(var(--foreground))] mb-2">
                יצירת סיסמה חדשה
              </h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                זו הכניסה הראשונה שלך - יש להגדיר סיסמה קבועה
              </p>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label htmlFor="new-password-input" className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                  סיסמה חדשה
                </label>
                <Input
                  id="new-password-input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="לפחות 6 תווים"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="confirm-password-input" className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                  אימות סיסמה
                </label>
                <Input
                  id="confirm-password-input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="הזן שוב את הסיסמה החדשה"
                  required
                  disabled={loading}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={loading || !newPassword || !confirmPassword}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    שומר...
                  </>
                ) : (
                  'שמור סיסמה'
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // --- Admin dashboard --------------------------------------------------

  if (step === 'adminDashboard') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[hsl(var(--background))] to-[hsl(var(--muted))] p-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-[hsl(var(--card))] rounded-lg shadow-lg border border-[hsl(var(--border))] p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-[hsl(var(--primary))]" />
                <div>
                  <h2 className="text-xl font-bold text-[hsl(var(--foreground))] mb-1">
                    ניהול מערכת - {teacher?.name}
                  </h2>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    כל המורים במערכת
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={resetToLogin}>
                התנתק
              </Button>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="bg-[hsl(var(--card))] rounded-lg border border-[hsl(var(--border))] overflow-hidden">
            <div className="divide-y divide-[hsl(var(--border))]">
              {teacherList.map((t) => (
                <div key={t.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-[hsl(var(--foreground))]">{t.name}</p>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">{t.email}</p>
                    {t.mustResetPassword && (
                      <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-md bg-yellow-100 text-yellow-800">
                        טרם אופסה סיסמה
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleResetTeacherPassword(t.id, t.name)}>
                      אפס סיסמה
                    </Button>
                    <Button size="sm" onClick={() => handleActAsTeacher(t.id)} disabled={loading}>
                      דווח בשם המורה
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Students list ------------------------------------------------------

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
              <Button variant="outline" onClick={actingAsAdmin ? handleBackToAdminDashboard : resetToLogin}>
                {actingAsAdmin ? 'חזור לניהול מערכת' : 'התנתק'}
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

  // --- Report type selection ----------------------------------------------

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
                דיווח של מספר שיעורים יחד, עם חתימה אחת משותפת לכולם
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
                דיווח של שיעור אחד בלבד, עם חתימה משלו
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Report form ---------------------------------------------------------

  if (step === 'form' && selectedStudent && reportType) {
    return (
      <ReportForm
        student={selectedStudent}
        teacher={teacher}
        reportType={reportType}
        token={token}
        onBack={handleBackToReportType}
      />
    );
  }

  return null;
}
