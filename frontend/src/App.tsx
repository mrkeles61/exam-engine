import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Jobs from './pages/Jobs';
import Results from './pages/Results';
import StudentDetail from './pages/StudentDetail';
import AnswerKeys from './pages/AnswerKeys';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="upload" element={<Upload />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="answer-keys" element={<AnswerKeys />} />
            <Route path="results/:jobId" element={<Results />} />
            <Route path="results/:jobId/student/:studentId" element={<StudentDetail />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
