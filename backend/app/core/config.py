from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "Exam Evaluation Engine"
    DEBUG: bool = False
    API_PREFIX: str = "/api"

    # Security
    JWT_SECRET_KEY: str = "change-me-in-production-use-openssl-rand-hex-32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://examengine:changeme@localhost:5432/examengine"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost",
        "http://localhost:80",
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    # File storage
    UPLOAD_DIR: str = "/data/uploads"
    MAX_UPLOAD_SIZE_MB: int = 50

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # Seeding
    ADMIN_EMAIL: str = "admin@university.edu"
    ADMIN_PASSWORD: str = "admin123"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "case_sensitive": True}


settings = Settings()
