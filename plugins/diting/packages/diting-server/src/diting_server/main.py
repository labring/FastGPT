#!/usr/bin/env python
# -*- coding: utf-8 -*-

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from diting_server.apis.v1.router import v1_router
from diting_server.common.logging_config.config import (
    LoggingConfig,
    get_logger,
    setup_logging,
    get_uvicorn_log_config,
)
from diting_server.config.settings import Settings, get_settings, settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Diting Engine API", version="1.0.0")

    # Access log
    configure_logging(settings)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(v1_router)
    return app


def configure_logging(settings: Settings) -> None:
    """Configure logging for the application."""
    config = LoggingConfig(
        level=settings.log_level, structured=settings.log_format == "json"
    )
    setup_logging(config, settings.environment == "Development")
    logger = get_logger(__name__)
    logger.info("Logging configured", config=config)


app = create_app()

if __name__ == "__main__":
    import uvicorn

    log_config = get_uvicorn_log_config(settings)
    uvicorn.run(app, host=settings.host, port=settings.port, log_config=log_config)
