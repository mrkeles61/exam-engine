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
export type QuestionType = 'mc' | 'ms' | 'open' | 'match' | 'fill';

export interface QuestionSchema {
  number: number;
  // Extended in Fix #2: supports all five types. Legacy rows may contain
  // only 'mc' | 'open' — those continue to validate as plain strings.
  type: QuestionType | string;
  question_type?: QuestionType;
  correct_answer: string | null;
  rubric: string | null;
  points: number;
  // Rendering / richer content
  text?: string | null;
  options?: Record<string, string> | null;
  fill_template?: string | null;
  fill_answers?: string[] | null;
  // Multi-select (ms)
  ms_correct?: string[] | null;
  // Matching (match)
  match_left?: string[] | null;
  match_right?: string[] | null;
  match_pairs?: [number, number][] | null;
  // Shared new builder fields
  image_url?: string | null;
  penalty_per_item?: number | null;
  space_size?: number | null;
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
// Student Results — Workspace-grade per-answer metadata
// ---------------------------------------------------------------------------
export interface BBox {
  page: number;
  x: number;  // normalized 0-1
  y: number;  // normalized 0-1
  w: number;  // normalized 0-1
  h: number;  // normalized 0-1
}

export interface RubricItem {
  label: string;
  score: number;
  max_score: number;
  status: 'pass' | 'partial' | 'fail';
}

export interface AnswerDetail {
  question_number: number;
  question_type: 'mc' | 'ms' | 'open' | 'fill' | 'match';
  label: string | null;
  student_answer: string | null;
  correct_answer: string | null;
  is_correct: boolean | null;
  score: number;
  max_score: number;
  feedback: string | null;
  confidence: number | null;
  ocr_confidence: number | null;
  segmentation_confidence?: number | null;
  bbox: BBox | null;
  bubble_fills: Record<string, number> | null;  // MC only, e.g. {A: 0.08, B: 0.92, ...}
  ai_reasoning: string | null;
  model_used: string | null;
  rubric_breakdown: RubricItem[] | null;
  override_applied: boolean;
  needs_review: boolean;
  // Rendering-ready content for the mock scan viewer
  question_text: string | null;
  option_texts: Record<string, string> | null;         // MC options
  handwritten_answer: string | null;                   // open
  fill_template: string | null;                        // fill — "… ___ … ___ …"
  fill_blanks: Record<string, string> | null;          // fill — student's writing
  correct_blanks: Record<string, string> | null;       // fill — the answer key
  handwriting_seed: number | null;                     // drives per-student font/color
  // Multi-select / matching / image / reserved-space extensions
  ms_student_answers?: string[];                        // ms — letters the student filled
  ms_correct?: string[];                                // ms — correct letters
  match_student_pairs?: [number, number][];             // match — [leftIdx, rightIdx] chosen
  match_left?: string[];                                // match — left-column labels
  match_right?: string[];                               // match — right-column labels
  match_pairs?: [number, number][];                     // match — correct pairs
  image_url?: string | null;                            // optional per-question image
  space_size?: number;                                  // 0=None, 1=Tiny … 6=XXL
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
  approved_at: string | null;
  approved_by: string | null;
  approved_by_email: string | null;
}

// ---------------------------------------------------------------------------
// Override workflow
// ---------------------------------------------------------------------------
export interface QuestionOverrideRequest {
  question_number: number;
  new_score: number;
  reason: string;
}

export interface AnswerRemapRequest {
  question_number: number;
  new_student_answer: string;  // A/B/C/D/E
  reason: string;
}

export interface OverrideHistoryItem {
  id: string;
  question_number: number;
  previous_score: number;
  new_score: number;
  reason: string;
  overridden_by: string | null;
  overridden_by_email: string | null;
  overridden_at: string;
  kind?: 'override' | 'approve' | 'reopen' | 'remap' | 'flag_segmentation';
}

export interface OverrideHistoryResponse {
  job_id: string;
  student_id: string;
  total: number;
  history: OverrideHistoryItem[];
}

export interface ApprovalResponse {
  job_id: string;
  student_id: string;
  approved_at: string | null;
  approved_by: string | null;
  approved_by_email: string | null;
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
