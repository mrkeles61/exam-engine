import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_db, require_professor_or_admin
from app.models.models import AnswerKey, User
from app.schemas.schemas import AnswerKeyCreate, AnswerKeyOut, AnswerKeyUpdate, AnswerKeyValidateOut

router = APIRouter(prefix="/answer-keys", tags=["Answer Keys"])


@router.post(
    "",
    response_model=AnswerKeyOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create Answer Key",
    description="Creates a new answer key. Questions are stored in JSONB format with question number, type (mc/open), correct answer, and point value.",
)
async def create_answer_key(
    body: AnswerKeyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    key = AnswerKey(
        name=body.name,
        course_name=body.course_name,
        questions=[q.model_dump() for q in body.questions],
        created_by=current_user.id,
    )
    db.add(key)
    await db.commit()
    await db.refresh(key)
    return key


@router.get(
    "",
    response_model=List[AnswerKeyOut],
    summary="List Answer Keys",
    description="Returns all answer keys sorted by creation date (newest first).",
)
async def list_answer_keys(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    result = await db.execute(select(AnswerKey).order_by(AnswerKey.created_at.desc()))
    return result.scalars().all()


@router.get(
    "/{key_id}",
    response_model=AnswerKeyOut,
    summary="Get Answer Key Detail",
    description="Returns all questions and correct answers for a specific answer key.",
)
async def get_answer_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    result = await db.execute(select(AnswerKey).where(AnswerKey.id == key_id))
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="Answer key not found")
    return key


@router.put(
    "/{key_id}",
    response_model=AnswerKeyOut,
    summary="Update Answer Key",
    description="Updates the name, course name, or questions of an existing answer key. Only provided fields are changed.",
)
async def update_answer_key(
    key_id: uuid.UUID,
    body: AnswerKeyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    result = await db.execute(select(AnswerKey).where(AnswerKey.id == key_id))
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="Answer key not found")

    if body.name is not None:
        key.name = body.name
    if body.course_name is not None:
        key.course_name = body.course_name
    if body.questions is not None:
        key.questions = [q.model_dump() for q in body.questions]

    await db.commit()
    await db.refresh(key)
    return key


@router.post(
    "/{key_id}/validate",
    response_model=AnswerKeyValidateOut,
    summary="Validate Answer Key",
    description="Checks the answer key for issues: missing MC answers, total points not equal to 100, duplicate question numbers, and missing rubrics for open-ended questions.",
)
async def validate_answer_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    result = await db.execute(select(AnswerKey).where(AnswerKey.id == key_id))
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="Answer key not found")

    questions = key.questions or []
    warnings = []

    for q in questions:
        if q.get("type") == "mc" and not q.get("correct_answer"):
            warnings.append(f"Soru {q['number']} cevabı eksik")

    total_points = sum(q.get("points", 0) for q in questions)
    if questions and abs(total_points - 100.0) > 0.01:
        warnings.append(f"Toplam puan {total_points:.0f}, 100 olmalı")

    numbers = [q.get("number") for q in questions]
    seen = set()
    for n in numbers:
        if n in seen:
            warnings.append(f"Soru {n} numarası tekrar ediyor")
        seen.add(n)

    for q in questions:
        if q.get("type") == "open" and not q.get("rubric"):
            warnings.append(f"Soru {q['number']} için rubric eksik")

    return AnswerKeyValidateOut(valid=len(warnings) == 0, warnings=warnings)


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete Answer Key",
    description="Permanently deletes an answer key from the database.",
)
async def delete_answer_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    result = await db.execute(select(AnswerKey).where(AnswerKey.id == key_id))
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="Answer key not found")
    await db.delete(key)
    await db.commit()
