import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AdminLayout } from './layouts/AdminLayout';
import { StudentLayout } from './layouts/StudentLayout';
import { AdminAnalyticsPage } from './pages/admin/AdminAnalyticsPage';
import { AdminCreateQuestionPage } from './pages/admin/AdminCreateQuestionPage';
import { AdminImportPage } from './pages/admin/AdminImportPage';
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage';
import { AdminProfilePage } from './pages/admin/AdminProfilePage';
import { AdminQuestionBankListPage } from './pages/admin/AdminQuestionBankListPage';
import { AdminQuestionBankPage } from './pages/admin/AdminQuestionBankPage';
import { AdminReviewsPage } from './pages/admin/AdminReviewsPage';
import { AdminRoomPage } from './pages/admin/AdminRoomPage';
import { AdminStudentsPage } from './pages/admin/AdminStudentsPage';
import { AdminStudentHistoryPage } from './pages/admin/AdminStudentHistoryPage';
import { AdminTestsPage } from './pages/admin/AdminTestsPage';
import { LoginPage } from './pages/auth/LoginPage';
import { SignupPage } from './pages/auth/SignupPage';
import { AnswerPage } from './pages/student/AnswerPage';
import { ProfilePage } from './pages/student/ProfilePage';
import { StudentLobbyPage } from './pages/student/StudentLobbyPage';
import { ReadingPage } from './pages/student/ReadingPage';
import { ResultPage } from './pages/student/ResultPage';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { TestIntroPage } from './pages/student/TestIntroPage';

function ProtectedRoute({
  children,
  role,
}: {
  children: React.ReactNode;
  role: 'ADMIN' | 'STUDENT';
}) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="page-loader">Loading...</div>;
  }
  if (!user) {
    return <Navigate replace to="/login" />;
  }
  if (user.role !== role) {
    return <Navigate replace to={user.role === 'ADMIN' ? '/admin' : '/student'} />;
  }
  return <>{children}</>;
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route element={<Navigate replace to={user ? (user.role === 'ADMIN' ? '/admin' : '/student') : '/login'} />} path="/" />
      <Route element={<LoginPage />} path="/login" />
      <Route element={<SignupPage />} path="/signup" />

      <Route element={<ProtectedRoute role="ADMIN"><AdminLayout /></ProtectedRoute>} path="/admin">
        <Route element={<AdminOverviewPage />} index />
        <Route element={<AdminTestsPage />} path="tests" />
        <Route element={<AdminImportPage />} path="import" />
        <Route element={<AdminCreateQuestionPage />} path="create" />
        <Route element={<AdminQuestionBankListPage />} path="questions" />
        <Route element={<AdminQuestionBankPage />} path="questions/:bankId" />
        <Route element={<AdminAnalyticsPage />} path="analytics" />
        <Route element={<AdminReviewsPage />} path="reviews" />
        <Route element={<AdminRoomPage />} path="room" />
        <Route element={<AdminStudentsPage />} path="students" />
        <Route element={<AdminStudentHistoryPage />} path="students/:studentId" />
        <Route element={<AdminProfilePage />} path="profile" />
      </Route>

      <Route element={<ProtectedRoute role="STUDENT"><StudentLayout /></ProtectedRoute>} path="/student">
        <Route element={<StudentDashboard />} index />
        <Route element={<ProfilePage />} path="profile" />
      </Route>

      <Route element={<ProtectedRoute role="STUDENT"><TestIntroPage /></ProtectedRoute>} path="/student/tests/:testId/intro" />
      <Route element={<ProtectedRoute role="STUDENT"><StudentLobbyPage /></ProtectedRoute>} path="/student/sessions/:sessionId/lobby" />
      <Route element={<ProtectedRoute role="STUDENT"><ReadingPage /></ProtectedRoute>} path="/student/sessions/:sessionId/reading" />
      <Route element={<ProtectedRoute role="STUDENT"><AnswerPage /></ProtectedRoute>} path="/student/sessions/:sessionId/answer" />
      <Route element={<ProtectedRoute role="STUDENT"><ResultPage /></ProtectedRoute>} path="/student/sessions/:sessionId/result" />
    </Routes>
  );
}
