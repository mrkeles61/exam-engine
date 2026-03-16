import os
import shutil
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.dependencies import get_db, require_professor_or_admin
from app.models.models import Exam, ExamType, User
from app.schemas.schemas import ExamOut

router = APIRouter(prefix="/upload", tags=["Exam Management"])


@router.post(
    "",
    response_model=ExamOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload Exam PDF",
    description="Accepts a scanned exam PDF file, saves it under /data/uploads/, and creates an Exam record in the database with title, course name, and exam type.",
)
async def upload_exam(
    file: UploadFile = File(...),
    title: str = "Untitled Exam",
    course_name: str = "Unknown Course",
    exam_type: ExamType = ExamType.mixed,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.MAX_UPLOAD_SIZE_MB:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.MAX_UPLOAD_SIZE_MB} MB limit")

    exam_id = uuid.uuid4()
    dest_dir = os.path.join(settings.UPLOAD_DIR, str(exam_id))
    os.makedirs(dest_dir, exist_ok=True)
    dest_path = os.path.join(dest_dir, "original.pdf")

    with open(dest_path, "wb") as f:
        f.write(content)

    exam = Exam(
        id=exam_id,
        title=title,
        course_name=course_name,
        exam_type=exam_type,
        pdf_path=dest_path,
        uploaded_by=current_user.id,
    )
    db.add(exam)
    await db.commit()
    await db.refresh(exam)
    return exam


@router.get(
    "/{exam_id}",
    response_model=ExamOut,
    summary="Get Exam Detail",
    description="Returns metadata for a specific exam (title, course, type, upload date) from the database.",
)
async def get_upload(
    exam_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam


@router.delete(
    "/{exam_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Exam",
    description="Permanently deletes the exam record from the database and removes the PDF file from disk.",
)
async def delete_upload(
    exam_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    result = await db.execute(select(Exam).where(Exam.id == exam_id))
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if exam.pdf_path:
        exam_dir = os.path.dirname(exam.pdf_path)
        if os.path.isdir(exam_dir):
            shutil.rmtree(exam_dir, ignore_errors=True)

    await db.delete(exam)
    await db.commit()
