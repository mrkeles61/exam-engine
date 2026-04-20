import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './contexts/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { FullScreenLayout } from './components/FullScreenLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Jobs from './pages/Jobs';
import Results from './pages/Results';
import StudentDetail from './pages/StudentDetail';
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
            {/* Classic workspace kept as fallback for the layout switcher (Klasik/Sekmeli/Bölünmüş) */}
            <Route path="results/:jobId/student/:studentId/classic" element={<StudentDetail />} />
            <Route path="results/:jobId/student/:studentId/tabs" element={<StudentDetail />} />
            <Route path="results/:jobId/student/:studentId/split" element={<StudentDetail />} />
            {/* Legacy route */}
            <Route path="grading/:jobId/:studentId" element={<StudentDetail />} />
          </Route>

          {/* Full-screen routes — no left sidebar, top nav is internal.
              The student workspace default lives here so every link to a student lands on V4. */}
          <Route element={<ProtectedRoute><FullScreenLayout /></ProtectedRoute>}>
            <Route path="results/:jobId/student/:studentId" element={<StudentDetailV4 />} />
            <Route path="results/:jobId/student/:studentId/v4" element={<StudentDetailV4 />} />
            <Route path="exam-builder" element={<ExamBuilder />} />
            <Route path="exam-builder/:answerKeyId" element={<ExamBuilder />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
