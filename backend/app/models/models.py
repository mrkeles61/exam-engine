import uuid
import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Column, String, Float, Integer, Text, DateTime,
    ForeignKey, Enum as SAEnum, func,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class UserRole(str, enum.Enum):
    admin = "admin"
    professor = "professor"
    viewer = "viewer"


class ExamType(str, enum.Enum):
    mc = "mc"
    open = "open"
    mixed = "mixed"


class JobStatus(str, enum.Enum):
    pending = "pending"
    ocr_running = "ocr_running"
    ocr_complete = "ocr_complete"
    ocr_failed = "ocr_failed"
    layout_running = "layout_running"
    layout_complete = "layout_complete"
    layout_failed = "layout_failed"
    eval_running = "eval_running"
    complete = "complete"
    eval_failed = "eval_failed"
    failed = "failed"


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole, native_enum=False), nullable=False, default=UserRole.professor)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    exams = relationship("Exam", back_populates="uploader", foreign_keys="Exam.uploaded_by")
    answer_keys = relationship("AnswerKey", back_populates="creator")


class AnswerKey(Base):
    __tablename__ = "answer_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    course_name = Column(String(255), nullable=False)
    questions = Column(JSONB, nullable=False, default=list)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    creator = relationship("User", back_populates="answer_keys")
    exams = relationship("Exam", back_populates="answer_key")


class Exam(Base):
    __tablename__ = "exams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    course_name = Column(String(255), nullable=False)
    exam_type = Column(SAEnum(ExamType, native_enum=False), nullable=False, default=ExamType.mixed)
    pdf_path = Column(String(500), nullable=True)
    answer_key_id = Column(UUID(as_uuid=True), ForeignKey("answer_keys.id", ondelete="SET NULL"), nullable=True)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    answer_key = relationship("AnswerKey", back_populates="exams")
    uploader = relationship("User", back_populates="exams", foreign_keys=[uploaded_by])
    jobs = relationship("EvaluationJob", back_populates="exam")


class EvaluationJob(Base):
    __tablename__ = "evaluation_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exam_id = Column(UUID(as_uuid=True), ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)
    answer_key_id = Column(UUID(as_uuid=True), nullable=True)  # Resolved key for this run
    status = Column(SAEnum(JobStatus, native_enum=False), nullable=False, default=JobStatus.pending)
    current_stage = Column(String(50), nullable=True)
    progress_pct = Column(Integer, default=0)
    progress_detail = Column(String(500), default="Queued")
    total_students = Column(Integer, default=0)
    processed_students = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    ocr_output = Column(JSONB, nullable=True)
    layout_output = Column(JSONB, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    exam = relationship("Exam", back_populates="jobs")
    results = relationship("StudentResult", back_populates="job", cascade="all, delete-orphan")
    logs = relationship("PipelineLog", back_populates="job", cascade="all, delete-orphan",
                        order_by="PipelineLog.timestamp")


class StudentResult(Base):
    __tablename__ = "student_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("evaluation_jobs.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(String(20), nullable=False, index=True)
    student_name = Column(String(255), nullable=False)
    mc_score = Column(Float, default=0.0)
    mc_total = Column(Float, default=0.0)
    open_score = Column(Float, default=0.0)
    open_total = Column(Float, default=0.0)
    total_pct = Column(Float, default=0.0)
    grade = Column(String(5), nullable=False, default="FF")
    answers = Column(JSONB, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Teacher review / approval workflow (multi-teacher audit trail)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_by_email = Column(String(255), nullable=True)  # snapshot so display survives user deletion

    job = relationship("EvaluationJob", back_populates="results")
    overrides = relationship(
        "OverrideHistory",
        primaryjoin="and_(StudentResult.job_id == foreign(OverrideHistory.job_id), "
                    "StudentResult.student_id == foreign(OverrideHistory.student_id))",
        viewonly=True,
        order_by="OverrideHistory.overridden_at.desc()",
    )


class OverrideHistory(Base):
    """
    Append-only audit log of every per-question score override made by a teacher.
    Composite link to StudentResult via (job_id, student_id). We snapshot the
    user's email so the history stays readable even if the account is removed.
    """
    __tablename__ = "override_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("evaluation_jobs.id", ondelete="CASCADE"),
                    nullable=False, index=True)
    student_id = Column(String(20), nullable=False, index=True)
    question_number = Column(Integer, nullable=False)
    previous_score = Column(Float, nullable=False)
    new_score = Column(Float, nullable=False)
    reason = Column(Text, nullable=False)
    overridden_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    overridden_by_email = Column(String(255), nullable=True)
    overridden_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PipelineLog(Base):
    __tablename__ = "pipeline_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("evaluation_jobs.id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(DateTime(timezone=True), nullable=False,
                       default=lambda: datetime.now(timezone.utc))
    stage = Column(String(50), nullable=False)   # ocr | layout | evaluation | system
    level = Column(String(20), nullable=False)   # info | success | warning | error
    message = Column(String(1000), nullable=False)
    student_id = Column(String(20), nullable=True)
    student_name = Column(String(255), nullable=True)
    score = Column(Float, nullable=True)

    job = relationship("EvaluationJob", back_populates="logs")
