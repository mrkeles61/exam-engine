from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Optional
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
    type: str  # "mc" | "open"
    correct_answer: Optional[str] = None
    rubric: Optional[str] = None
    points: float = 1.0


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

class AnswerDetail(BaseModel):
    question_number: int
    question_type: str
    student_answer: Optional[str]
    correct_answer: Optional[str]
    is_correct: Optional[bool]
    score: float
    max_score: float
    feedback: Optional[str] = None
    confidence: Optional[float] = None


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
    mc_score: Optional[float] = None
    open_score: Optional[float] = None
    grade: Optional[str] = None
    override_reason: str


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
