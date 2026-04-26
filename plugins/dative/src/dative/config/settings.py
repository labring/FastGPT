# -*- coding: utf-8 -*-
from typing import ClassVar

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_file=".env",
        env_prefix="DATIVE_",
        env_file_encoding="utf-8",
        extra="ignore",
        env_nested_delimiter="__",
        nested_model_default_partial_update=True,
    )

    DATABASE_URL: str = ""
    log_level: str = "INFO"
    log_format: str = "plain"
    redis_url: str = ""


settings = Settings()
