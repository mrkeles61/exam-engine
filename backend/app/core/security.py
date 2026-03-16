from datetime import datetime, timedelta, timezone
from typing import Optional, Any
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import HTTPException, status

from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _create_token(data: dict, expire_delta: timedelta) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + expire_delta
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(subject: Any) -> str:
    return _create_token(
        {"sub": str(subject), "type": "access"},
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def create_refresh_token(subject: Any) -> str:
    return _create_token(
        {"sub": str(subject), "type": "refresh"},
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
