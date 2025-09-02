from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    environment: Literal["Development", "Test", "Production"] = "Production"
    log_level: str = "INFO"
    log_format: str = "plain"  # json
    host: str = "0.0.0.0"
    port: int = 3001


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
