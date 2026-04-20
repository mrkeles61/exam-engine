import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { FullScreenLayout } from './components/FullScreenLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Jobs from './pages/Jobs';
import Results from './pages/Results';
import StudentDetailV4 from './pages/StudentDetailV4';
import ExamBuilder from './pages/ExamBuilder';
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

          {/* Sidebar layout — primary pages */}
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
          </Route>

          {/* Full-screen layout — workspaces that reclaim the whole viewport */}
          <Route
            element={
              <ProtectedRoute>
                <FullScreenLayout />
              </ProtectedRoute>
            }
          >
            <Route path="results/:jobId/student/:studentId" element={<StudentDetailV4 />} />
            <Route path="exam-builder" element={<ExamBuilder />} />
            <Route path="exam-builder/:answerKeyId" element={<ExamBuilder />} />
          </Route>

          {/* Legacy redirects — any old Classic/Tabbed/Split/V4-suffixed URL lands on the canonical V4 route */}
          <Route
            path="results/:jobId/student/:studentId/classic"
            element={<Navigate to=".." replace relative="path" />}
          />
          <Route
            path="results/:jobId/student/:studentId/tabs"
            element={<Navigate to=".." replace relative="path" />}
          />
          <Route
            path="results/:jobId/student/:studentId/split"
            element={<Navigate to=".." replace relative="path" />}
          />
          <Route
            path="results/:jobId/student/:studentId/v4"
            element={<Navigate to=".." replace relative="path" />}
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
