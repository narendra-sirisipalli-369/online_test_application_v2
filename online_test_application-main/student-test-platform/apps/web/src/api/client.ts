import type { Avatar, BankSummary, DetailedAnswerRow, ExtractionIssue, HistoryEntry, LobbyState, Question, ReviewRatingEntry, StudentHistoryEntry, StudentSummary, Test, TestSession, User } from '../types/app';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4100';

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  formData?: FormData;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(data.message || 'Request failed');
  }
  return response.json() as Promise<T>;
}

export const api = {
  listAvatars: () => request<{ avatars: Avatar[] }>('/api/auth/avatars'),
  studentSignup: (body: { name: string; password: string; course: string; mobileNumber: string; avatarId?: string }) =>
    request<{ token: string; user: User }>('/api/auth/student-signup', { method: 'POST', body }),
  login: (body: { name: string; password: string }) =>
    request<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body }),
  me: (token: string) => request<{ user: User }>('/api/auth/me', { token }),
  updateProfile: (token: string, body: { name?: string; currentPassword: string; newPassword?: string }) =>
    request<{ user: User }>('/api/auth/me', { token, method: 'PUT', body }),

  adminDashboard: (token: string) => request<{ counts: Record<string, number> }>('/api/admin/dashboard', { token }),
  adminReviewsRatings: (token: string) => request<{
    summary: { total: number; writtenReviewCount: number; averageRating: number | null; fiveStarCount: number };
    reviews: ReviewRatingEntry[];
  }>('/api/admin/reviews-ratings', { token }),
  adminStudents: (token: string) => request<{ students: StudentSummary[] }>('/api/admin/students', { token }),
  adminStudentHistory: (token: string, studentId: string) => request<{
    student: Omit<StudentSummary, 'sessionCount'>;
    summary: { totalSessions: number; completedSessions: number; averageScore: number | null; ratedSessions: number };
    history: StudentHistoryEntry[];
  }>(`/api/admin/students/${studentId}/history`, { token }),
  blockStudent: (token: string, studentId: string, blocked: boolean) =>
    request<{ id: string; isBlocked: boolean }>(`/api/admin/students/${studentId}/block`, { token, method: 'PATCH', body: { blocked } }),
  deleteStudent: (token: string, studentId: string) =>
    request<{ ok: boolean }>(`/api/admin/students/${studentId}`, { token, method: 'DELETE' }),
  adminTests: (token: string) => request<{ tests: Test[] }>('/api/admin/tests', { token }),
  adminQuestions: (token: string) => request<{ questions: Question[] }>('/api/admin/questions', { token }),
  createTest: (token: string, body: unknown) => request<{ test: Test }>('/api/admin/tests', { token, method: 'POST', body }),
  updateTest: (token: string, testId: string, body: unknown) => request<{ test: Test }>(`/api/admin/tests/${testId}`, { token, method: 'PUT', body }),
  publishTest: (token: string, testId: string) => request<{ test: Test }>(`/api/admin/tests/${testId}/publish`, { token, method: 'POST' }),
  attachQuestions: (token: string, testId: string, questionIds: string[]) =>
    request<{ test: Test }>(`/api/admin/tests/${testId}/questions`, { token, method: 'POST', body: { questionIds } }),
  uploadDocx: (token: string, formData: FormData) =>
    request<{ document: { id: string }; questions: Question[]; issues: ExtractionIssue[] }>('/api/admin/imports/docx', {
      token,
      method: 'POST',
      formData,
    }),
  adminBanks: (token: string) => request<{ banks: BankSummary[] }>('/api/admin/banks', { token }),
  adminBankQuestions: (token: string, bankId: string) =>
    request<{ bank: { id: string; name: string; type: string }; questions: Question[] }>(`/api/admin/banks/${bankId}/questions`, { token }),
  createBank: (token: string, body: unknown) =>
    request<{ bank: { id: string; name: string }; questions: Question[] }>('/api/admin/banks', { token, method: 'POST', body }),
  deleteBank: (token: string, bankId: string) =>
    request<{ ok: boolean }>(`/api/admin/banks/${bankId}`, { token, method: 'DELETE' }),
  updateQuestion: (token: string, questionId: string, body: unknown) =>
    request<{ question: Question }>(`/api/admin/questions/${questionId}`, { token, method: 'PUT', body }),
  createManualQuestion: (token: string, formData: FormData) =>
    request<{ question: Question }>('/api/admin/questions/manual', { token, method: 'POST', formData }),
  uploadImage: (token: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return request<{ path: string }>('/api/admin/uploads/image', { token, method: 'POST', formData });
  },
  exportImportedDocument: async (token: string, documentId: string) => {
    const response = await fetch(`${API_URL}/api/admin/imports/${documentId}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({ message: 'Export failed' }));
      throw new Error(data.message || 'Export failed');
    }
    return response.blob();
  },
  analytics: (token: string, testId: string) =>
    request<{
      overview: { totalSessions: number; averageScore: number };
      leaderboard: Array<Record<string, unknown>>;
      studentPerformance: Array<Record<string, unknown>>;
      questionStats: Array<Record<string, unknown>>;
    }>(`/api/admin/tests/${testId}/analytics`, { token }),
  adminLobby: (token: string, testId: string) =>
    request<LobbyState>(`/api/admin/tests/${testId}/lobby`, { token }),
  detailedAnswers: (token: string, testId: string) =>
    request<{ rows: DetailedAnswerRow[] }>(`/api/admin/tests/${testId}/detailed-answers`, { token }),
  unlockTest: (token: string, testId: string) =>
    request<LobbyState>(`/api/admin/tests/${testId}/unlock`, { token, method: 'POST' }),
  endTest: (token: string, testId: string) =>
    request<{ ok: boolean }>(`/api/admin/tests/${testId}/end`, { token, method: 'POST' }),

  studentTests: (token: string) => request<{ tests: Test[] }>('/api/student/tests', { token }),
  startTest: (token: string, testId: string) => request<{ session: TestSession }>(`/api/student/tests/${testId}/start`, { token, method: 'POST' }),
  waitingRoom: (token: string, testId: string) => request<LobbyState>(`/api/student/tests/${testId}/waiting-room`, { token }),
  getSession: (token: string, sessionId: string) => request<{ session: TestSession }>(`/api/student/sessions/${sessionId}`, { token }),
  getReadingQuestions: (token: string, sessionId: string) =>
    request<{ selectedQuestionIds: string[]; questions: Question[] }>(`/api/student/sessions/${sessionId}/reading-questions`, { token }),
  saveSelections: (token: string, sessionId: string, questionIds: string[]) =>
    request<{ session: TestSession }>(`/api/student/sessions/${sessionId}/selections`, { token, method: 'POST', body: { questionIds } }),
  lockReading: (token: string, sessionId: string) =>
    request<{ session: TestSession }>(`/api/student/sessions/${sessionId}/lock-reading`, { token, method: 'POST' }),
  getAnswerQuestions: (token: string, sessionId: string) =>
    request<{ questions: Array<Question & { answer: string | null }> }>(`/api/student/sessions/${sessionId}/answer-questions`, { token }),
  saveAnswer: (token: string, sessionId: string, body: { questionId: string; selectedOptionKey: string }) =>
    request<{ ok: boolean }>(`/api/student/sessions/${sessionId}/answers`, { token, method: 'POST', body }),
  submitSession: (token: string, sessionId: string) =>
    request<{ session: TestSession }>(`/api/student/sessions/${sessionId}/submit`, { token, method: 'POST' }),
  sessionResult: (token: string, sessionId: string) =>
    request<{ session: TestSession; summary: Record<string, unknown> | null }>(`/api/student/sessions/${sessionId}/result`, { token }),
  submitFeedback: (token: string, sessionId: string, body: { rating: number; review: string }) =>
    request<{ rating: number; review: string; feedbackSubmittedAt: string }>(`/api/student/sessions/${sessionId}/feedback`, {
      token,
      method: 'PUT',
      body,
    }),
  updateAvatar: (token: string, avatarId: string) =>
    request<{ user: User }>('/api/student/profile/avatar', { token, method: 'PUT', body: { avatarId } }),
  updatePassword: (token: string, body: { currentPassword: string; newPassword: string }) =>
    request<{ ok: boolean }>('/api/student/profile/password', { token, method: 'PUT', body }),
  markOnboardingSeen: (token: string) =>
    request<{ onboardingSeenAt: string }>('/api/student/profile/onboarding-seen', { token, method: 'PUT' }),
  studentHistory: (token: string) =>
    request<{ history: HistoryEntry[] }>('/api/student/history', { token }),
};
