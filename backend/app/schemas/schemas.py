from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr, field_validator, ConfigDict

from app.models.models import UserRole, ExamType, JobStatus


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

class OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    role: UserRole = UserRole.professor

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(OrmBase):
    id: UUID
    email: str
    role: UserRole
    created_at: datetime


# ---------------------------------------------------------------------------
# Upload / Exam
# ---------------------------------------------------------------------------

class ExamOut(OrmBase):
    id: UUID
    title: str
    course_name: str
    exam_type: ExamType
    pdf_path: Optional[str]
    answer_key_id: Optional[UUID]
    uploaded_by: Optional[UUID]
    created_at: datetime


class ExamListItem(BaseModel):
    id: UUID
    title: str
    course_name: str
    exam_type: ExamType
    latest_job_status: Optional[str]
    student_count: int
    created_at: datetime


class ExamHistoryItem(BaseModel):
    job_id: UUID
    status: JobStatus
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    student_count: int
    average: Optional[float]


# ---------------------------------------------------------------------------
# Answer Keys
# ---------------------------------------------------------------------------

class QuestionSchema(BaseModel):
    number: int
    # Extended in Fix #2: adds 'ms' (multi-select) and 'match' alongside mc/open/fill.
    # Kept as a plain str (not Literal) to remain forgiving of legacy JSONB rows.
    type: str  # "mc" | "ms" | "open" | "match" | "fill"
    question_type: Optional[Literal["mc", "ms", "open", "match", "fill"]] = None
    correct_answer: Optional[str] = None
    rubric: Optional[str] = None
    points: float = 1.0
    # For rendering realistic mock scans + richer answer-key content
    text: Optional[str] = None                      # printed question text
    options: Optional[Dict[str, str]] = None        # mc only — {"A": "Abstraction", ...}
    fill_template: Optional[str] = None             # fill — sentence with "___" markers
    fill_answers: Optional[List[str]] = None        # fill — expected answers by blank index
    # Multi-select (ms)
    ms_correct: Optional[List[str]] = None          # correct option letters, e.g. ["A", "C"]
    # Matching (match)
    match_left: Optional[List[str]] = None          # left-column items
    match_right: Optional[List[str]] = None         # right-column items
    match_pairs: Optional[List[List[int]]] = None   # list of [leftIdx, rightIdx] correct pairs
    # Shared optional fields for new builder features
    image_url: Optional[str] = None                 # data: URL or external URL (per-question image)
    penalty_per_item: Optional[float] = 0.0         # deducted per wrong pick on mc/ms/match/fill
    space_size: Optional[int] = 0                   # 0=None, 1=Tiny … 6=XXL reserved answer area


class AnswerKeyCreate(BaseModel):
    name: str
    course_name: str
    questions: List[QuestionSchema]


class AnswerKeyUpdate(BaseModel):
    name: Optional[str] = None
    course_name: Optional[str] = None
    questions: Optional[List[QuestionSchema]] = None


class AnswerKeyOut(OrmBase):
    id: UUID
    name: str
    course_name: str
    questions: List[Any]
    created_by: Optional[UUID]
    created_at: datetime


class AnswerKeyValidateOut(BaseModel):
    valid: bool
    warnings: List[str]


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

class EvaluateRequest(BaseModel):
    exam_id: UUID
    answer_key_id: Optional[UUID] = None


class JobOut(OrmBase):
    id: UUID
    exam_id: UUID
    answer_key_id: Optional[UUID]
    status: JobStatus
    current_stage: Optional[str]
    progress_pct: int
    progress_detail: str
    total_students: int
    processed_students: int
    error_message: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime


# Stage-specific response schemas
class OcrStageOut(BaseModel):
    status: str
    pages_processed: int
    avg_confidence: float


class LayoutStageOut(BaseModel):
    status: str
    students_detected: int
    students: List[Dict[str, str]]


class EvalStageOut(BaseModel):
    status: str
    students_scored: int
    average: float


class StageResultsOut(BaseModel):
    ocr: Optional[Dict[str, Any]]
    layout: Optional[Dict[str, Any]]
    evaluation: Optional[Dict[str, Any]]


class RetryOut(BaseModel):
    job_id: UUID
    retrying_from: str
    new_status: str


# Timeline
class TimelineStage(BaseModel):
    name: str
    status: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_seconds: Optional[float]


class TimelineOut(BaseModel):
    job_id: UUID
    stages: List[TimelineStage]


# ---------------------------------------------------------------------------
# Pipeline Logs
# ---------------------------------------------------------------------------

class PipelineLogOut(OrmBase):
    id: UUID
    job_id: UUID
    timestamp: datetime
    stage: str
    level: str
    message: str
    student_id: Optional[str]
    student_name: Optional[str]
    score: Optional[float]


# ---------------------------------------------------------------------------
# Results
# ---------------------------------------------------------------------------

class BBox(BaseModel):
    page: int
    x: float   # normalized 0-1
    y: float   # normalized 0-1
    w: float   # normalized 0-1
    h: float   # normalized 0-1


class RubricItem(BaseModel):
    label: str
    score: float
    max_score: float
    status: str  # "pass" | "partial" | "fail"


class AnswerDetail(BaseModel):
    question_number: int
    # Extended in Fix #2: adds 'ms' and 'match' alongside mc/open/fill.
    # Kept as a plain str so legacy seeded answers keep validating.
    question_type: str
    label: Optional[str] = None
    student_answer: Optional[str]
    correct_answer: Optional[str]
    is_correct: Optional[bool]
    score: float
    max_score: float
    feedback: Optional[str] = None
    confidence: Optional[float] = None
    # Workspace-grade metadata (added for teacher review)
    ocr_confidence: Optional[float] = None
    # Per-stage confidence: how sure we are the bbox is placed on the right question.
    # Separate from ocr_confidence (text readability) and `confidence` (grading).
    segmentation_confidence: Optional[float] = None
    bbox: Optional[BBox] = None
    bubble_fills: Optional[Dict[str, float]] = None  # MC only
    ai_reasoning: Optional[str] = None
    model_used: Optional[str] = None
    rubric_breakdown: Optional[List[RubricItem]] = None
    override_applied: bool = False
    needs_review: bool = False
    # Rendering-ready content for the mock scan viewer
    question_text: Optional[str] = None              # printed question
    option_texts: Optional[Dict[str, str]] = None    # MC options
    handwritten_answer: Optional[str] = None         # open — what student "wrote"
    fill_template: Optional[str] = None              # fill — template with "___"
    fill_blanks: Optional[Dict[str, str]] = None     # fill — {"1": "many", "2": "parent class"}
    correct_blanks: Optional[Dict[str, str]] = None  # fill — answer key, for rendering comparisons
    handwriting_seed: Optional[int] = None           # drives per-student font/color/rotation
    # Multi-select (ms) rendering
    ms_student_answers: Optional[List[str]] = None   # letters the student picked, e.g. ["A", "C"]
    ms_correct: Optional[List[str]] = None           # echoed from the key for frontend rendering
    # Matching (match) rendering
    match_student_pairs: Optional[List[List[int]]] = None  # [leftIdx, rightIdx] pairs the student drew
    match_left: Optional[List[str]] = None           # echoed from the key
    match_right: Optional[List[str]] = None          # echoed from the key
    match_pairs: Optional[List[List[int]]] = None    # echoed correct pairs for frontend rendering
    # Shared optional visual fields
    image_url: Optional[str] = None                  # per-question image (data: URL or external)
    space_size: Optional[int] = 0                    # 0=None … 6=XXL reserved answer area


class StudentResultOut(OrmBase):
    id: UUID
    job_id: UUID
    student_id: str
    student_name: str
    mc_score: float
    mc_total: float
    open_score: float
    open_total: float
    total_pct: float
    grade: str
    answers: List[Any]
    created_at: datetime
    approved_at: Optional[datetime] = None
    approved_by: Optional[UUID] = None
    approved_by_email: Optional[str] = None


class ResultsListOut(BaseModel):
    job_id: UUID
    total: int
    results: List[StudentResultOut]


class StatsOut(BaseModel):
    job_id: UUID
    total_students: int
    average_pct: float
    highest_pct: float
    lowest_pct: float
    std_deviation: float
    grade_distribution: Dict[str, int]
    passing_rate: float


class StudentSummary(BaseModel):
    student_id: str
    student_name: str
    total_pct: float
    grade: str


class ReportOut(BaseModel):
    job_id: UUID
    exam_title: str
    course: str
    # Gap B additions: which answer key was used + template match confidence.
    answer_key_name: str = "Bilinmeyen"
    template_match_confidence: float = 0.95
    total_students: int
    average: float
    median: float
    std_dev: float
    pass_rate: float
    grade_distribution: Dict[str, int]
    top_3_students: List[StudentSummary]
    bottom_3_students: List[StudentSummary]
    hardest_questions: List[Dict[str, Any]]


class QuestionAnalytics(BaseModel):
    number: int
    type: str
    correct_count: int
    incorrect_count: int
    correct_rate: float
    most_common_wrong: Optional[str]


class AnalyticsOut(BaseModel):
    job_id: UUID
    questions: List[QuestionAnalytics]


class OverrideRequest(BaseModel):
    """Legacy bulk override — still supported, now writes an audit row."""
    mc_score: Optional[float] = None
    open_score: Optional[float] = None
    grade: Optional[str] = None
    override_reason: str

    @field_validator("override_reason")
    @classmethod
    def _reason_min_length(cls, v: str) -> str:
        if not v or len(v.strip()) < 10:
            raise ValueError("override_reason must be at least 10 characters")
        return v.strip()


class QuestionOverrideRequest(BaseModel):
    """Per-question override — the primary API for the review workspace."""
    question_number: int
    new_score: float
    reason: str

    @field_validator("reason")
    @classmethod
    def _reason_min_length(cls, v: str) -> str:
        if not v or len(v.strip()) < 10:
            raise ValueError("reason must be at least 10 characters")
        return v.strip()

    @field_validator("new_score")
    @classmethod
    def _score_non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("new_score must be >= 0")
        return v


class AnswerRemapRequest(BaseModel):
    """
    Correct the student_answer captured by OCR/bubble detection.
    MC only for now — teacher confirms the actual letter visible on the scan.
    Re-scores the question against the answer key and writes an audit row.
    """
    question_number: int
    new_student_answer: str
    reason: str

    @field_validator("new_student_answer")
    @classmethod
    def _letter_valid(cls, v: str) -> str:
        s = (v or "").strip().upper()
        if s not in {"A", "B", "C", "D", "E"}:
            raise ValueError("new_student_answer must be one of A/B/C/D/E")
        return s

    @field_validator("reason")
    @classmethod
    def _reason_min_length(cls, v: str) -> str:
        if not v or len(v.strip()) < 10:
            raise ValueError("reason must be at least 10 characters")
        return v.strip()


class FlagSegmentationRequest(BaseModel):
    """Flag a question's bbox as needing review (segmentation correction)."""
    question_number: int
    reason: str

    @field_validator("reason")
    @classmethod
    def _reason_min_length(cls, v: str) -> str:
        if not v or len(v.strip()) < 10:
            raise ValueError("reason must be at least 10 characters")
        return v.strip()


class OverrideHistoryItem(OrmBase):
    id: UUID
    question_number: int
    previous_score: float
    new_score: float
    reason: str
    # Classifies the audit entry. Persisted as a `[kind]` prefix in `reason` since
    # there's no dedicated column yet. Derived at read time in the router.
    kind: Optional[Literal["override", "approve", "reopen", "flag_segmentation"]] = "override"
    overridden_by: Optional[UUID] = None
    overridden_by_email: Optional[str] = None
    overridden_at: datetime


class OverrideHistoryOut(BaseModel):
    job_id: UUID
    student_id: str
    total: int
    history: List[OverrideHistoryItem]


class ApprovalOut(BaseModel):
    job_id: UUID
    student_id: str
    approved_at: Optional[datetime]
    approved_by: Optional[UUID]
    approved_by_email: Optional[str]


class NotifyOut(BaseModel):
    notified: bool
    message: str
    job_id: UUID


# ---------------------------------------------------------------------------
# Dashboard / Health
# ---------------------------------------------------------------------------

class DashboardOut(BaseModel):
    total_exams: int
    total_students: int
    avg_score: Optional[float]
    active_jobs: int
    recent_jobs: List[Dict[str, Any]]
    health: str


class HealthOut(BaseModel):
    status: str
    database: str
    redis: str
    uptime_seconds: float
    version: str
