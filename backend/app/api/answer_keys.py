import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_db, require_professor_or_admin
from app.models.models import AnswerKey, User
from app.schemas.schemas import AnswerKeyCreate, AnswerKeyOut, AnswerKeyUpdate, AnswerKeyValidateOut

router = APIRouter(prefix="/answer-keys", tags=["answer-keys"])


@router.post("", response_model=AnswerKeyOut, status_code=status.HTTP_201_CREATED)
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


@router.get("", response_model=List[AnswerKeyOut])
async def list_answer_keys(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_professor_or_admin),
):
    result = await db.execute(select(AnswerKey).order_by(AnswerKey.created_at.desc()))
    return result.scalars().all()


@router.get("/{key_id}", response_model=AnswerKeyOut)
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


@router.put("/{key_id}", response_model=AnswerKeyOut)
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


@router.post("/{key_id}/validate", response_model=AnswerKeyValidateOut)
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

    # Check for missing correct_answer on MC questions
    for q in questions:
        if q.get("type") == "mc" and not q.get("correct_answer"):
            warnings.append(f"Soru {q['number']} cevabı eksik")

    # Check total points add up to 100
    total_points = sum(q.get("points", 0) for q in questions)
    if questions and abs(total_points - 100.0) > 0.01:
        warnings.append(f"Toplam puan {total_points:.0f}, 100 olmalı")

    # Check for duplicate question numbers
    numbers = [q.get("number") for q in questions]
    seen = set()
    for n in numbers:
        if n in seen:
            warnings.append(f"Soru {n} numarası tekrar ediyor")
        seen.add(n)

    # Check for missing rubrics on open questions
    for q in questions:
        if q.get("type") == "open" and not q.get("rubric"):
            warnings.append(f"Soru {q['number']} için rubric eksik")

    return AnswerKeyValidateOut(valid=len(warnings) == 0, warnings=warnings)


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
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
