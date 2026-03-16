// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'professor' | 'viewer';
  created_at: string;
}

// ---------------------------------------------------------------------------
// Exam (Upload)
// ---------------------------------------------------------------------------
export type ExamType = 'mc' | 'open' | 'mixed';

export interface Exam {
  id: string;
  title: string;
  course_name: string;
  exam_type: ExamType;
  pdf_path: string | null;
  answer_key_id: string | null;
  uploaded_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Answer Keys
// ---------------------------------------------------------------------------
export interface QuestionSchema {
  number: number;
  type: 'mc' | 'open';
  correct_answer: string | null;
  rubric: string | null;
  points: number;
}

export interface AnswerKey {
  id: string;
  name: string;
  course_name: string;
  questions: QuestionSchema[];
  created_by: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Evaluation Jobs
// ---------------------------------------------------------------------------
export type JobStatus =
  | 'pending'
  | 'ocr_running'
  | 'ocr_complete'
  | 'ocr_failed'
  | 'layout_running'
  | 'layout_complete'
  | 'layout_failed'
  | 'eval_running'
  | 'complete'
  | 'eval_failed'
  | 'failed';

export interface EvaluationJob {
  id: string;
  exam_id: string;
  answer_key_id: string | null;
  status: JobStatus;
  current_stage: string | null;
  progress_pct: number;
  progress_detail: string;
  total_students: number;
  processed_students: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Pipeline Logs
// ---------------------------------------------------------------------------
export interface PipelineLog {
  id: string;
  job_id: string;
  timestamp: string;
  stage: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  student_id: string | null;
  student_name: string | null;
  score: number | null;
}

// ---------------------------------------------------------------------------
// Student Results
// ---------------------------------------------------------------------------
export interface AnswerDetail {
  question_number: number;
  question_type: 'mc' | 'open';
  student_answer: string | null;
  correct_answer: string | null;
  is_correct: boolean | null;
  score: number;
  max_score: number;
  feedback: string | null;
  confidence: number | null;
}

export interface StudentResult {
  id: string;
  job_id: string;
  student_id: string;
  student_name: string;
  mc_score: number;
  mc_total: number;
  open_score: number;
  open_total: number;
  total_pct: number;
  grade: string;
  answers: AnswerDetail[];
  created_at: string;
}

export interface ResultsList {
  job_id: string;
  total: number;
  results: StudentResult[];
}

export interface Stats {
  job_id: string;
  total_students: number;
  average_pct: number;
  highest_pct: number;
  lowest_pct: number;
  std_deviation: number;
  grade_distribution: Record<string, number>;
  passing_rate: number;
}
