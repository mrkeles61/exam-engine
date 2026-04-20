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
import Analytics from './pages/Analytics';
import PipelineMonitor from './pages/PipelineMonitor';
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
            <Route path="analytics" element={<Analytics />} />
            <Route path="pipeline/:jobId" element={<PipelineMonitor />} />
            <Route path="results/:jobId" element={<Results />} />
            <Route path="results/:jobId/student/:studentId" element={<StudentDetail />} />
            <Route path="results/:jobId/student/:studentId/classic" element={<StudentDetail />} />
            <Route path="results/:jobId/student/:studentId/tabs" element={<StudentDetail />} />
            <Route path="results/:jobId/student/:studentId/split" element={<StudentDetail />} />
            {/* Any lingering /v4 deep links fall back to the classic workspace */}
            <Route path="results/:jobId/student/:studentId/v4" element={<StudentDetail />} />
            {/* Legacy route */}
            <Route path="grading/:jobId/:studentId" element={<StudentDetail />} />
            {/* Exam-builder was an optional authoring surface that is not part of this
                public build; redirect anyone hitting the old URL to the answer-keys list. */}
            <Route path="exam-builder" element={<Navigate to="/answer-keys" replace />} />
            <Route path="exam-builder/:answerKeyId" element={<Navigate to="/answer-keys" replace />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
