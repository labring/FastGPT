import logging
import os
import sys
from dataclasses import dataclass
from types import TracebackType
from typing import Any

import structlog
from structlog.types import EventDict
from diting_server.config.settings import Settings


@dataclass
class LoggingConfig:
    level: str = "INFO"
    structured: bool = False


# https://github.com/hynek/structlog/issues/35#issuecomment-591321744
def rename_event_key(_, __, event_dict: EventDict) -> EventDict:  # type: ignore
    """
    Log entries keep the text message in the `event` field, but Datadog
    uses the `message` field. This processor moves the value from one field to
    the other.
    """
    event_dict["message"] = event_dict.pop("event")
    return event_dict


def drop_color_message_key(_, __, event_dict: EventDict) -> EventDict:  # type: ignore
    """
    Uvicorn logs the message a second time in the extra `color_message`, but we don't
    need it. This processor drops the key from the event dict if it exists.
    """
    event_dict.pop("color_message", None)
    return event_dict


# 自定义处理器，用于添加进程号（用于开发测试）
def add_process_id(_, __, event_dict: EventDict) -> EventDict:  # type: ignore
    record = event_dict.get("_record")
    event_dict["process"] = getattr(record, "process", os.getpid())  # 获取当前进程号
    return event_dict


def add_line(_, __, event_dict: EventDict) -> EventDict:  # type: ignore
    record = event_dict.get("_record")
    if not record:
        return event_dict
    file_path = getattr(record, "pathname", "")
    line = getattr(record, "lineno", "")
    func = getattr(record, "funcName", "")
    event_dict["line"] = f"{file_path}:{line}:({func})"  # 获取代码信息
    return event_dict


# 清空已有的日志设置
def clear_logging() -> None:
    for logger_name in ["uvicorn", "uvicorn.error"]:
        logger = logging.getLogger(logger_name)
        logger.handlers.clear()
        logger.propagate = True

    access_logger = logging.getLogger("uvicorn.access")
    access_logger.handlers.clear()
    access_logger.propagate = False
    # 关闭所有的日志处理器
    logging.shutdown()
    # 清空所有的日志记录器
    for handler in logging.root.handlers[:]:
        logging.root.removeHandler(handler)


def setup_logging(config: LoggingConfig, dev: bool = False) -> None:
    clear_logging()

    timestamper = structlog.processors.TimeStamper(fmt="iso")

    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.stdlib.ExtraAdder(),
        drop_color_message_key,
        timestamper,
        structlog.processors.StackInfoRenderer(),
    ]

    if config.structured:
        shared_processors.extend(
            [
                rename_event_key,
                structlog.processors.format_exc_info,
            ]
        )

    structlog.configure(
        processors=shared_processors
        + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    log_renderer = (
        structlog.processors.JSONRenderer()
        if config.structured
        else structlog.dev.ConsoleRenderer()
    )

    formatter_processors: list[Any] = [
        structlog.stdlib.ProcessorFormatter.remove_processors_meta,
        log_renderer,
    ]
    if dev:
        formatter_processors: list[Any] = [  # type: ignore
            add_process_id,
            add_line,
        ] + formatter_processors
    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=formatter_processors,
    )

    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    root_logger.setLevel(config.level.upper())

    def handle_exception(
        exc_type: type[BaseException],
        exc_value: BaseException,
        exc_traceback: TracebackType | None,
    ) -> None:
        """
        Log any uncaught exception instead of letting it be printed by Python
        (but leave KeyboardInterrupt untouched to allow users to Ctrl+C to stop)
        """
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
        else:
            root_logger.error(
                "Uncaught exception", exc_info=(exc_type, exc_value, exc_traceback)
            )

    sys.excepthook = handle_exception


get_logger = structlog.get_logger


def get_uvicorn_log_config(settings: Settings):
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "()": "uvicorn.logging.DefaultFormatter",
                "fmt": "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
            "access": {
                "()": "uvicorn.logging.AccessFormatter",
                "fmt": '%(asctime)s [%(levelname)s] %(client_addr)s - "%(request_line)s" %(status_code)s',
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
        },
        "handlers": {
            "default": {
                "formatter": "default",
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stderr",
            },
            "access": {
                "formatter": "access",
                "class": "logging.StreamHandler",
                "stream": "ext://sys.stdout",
            },
        },
        "loggers": {
            "uvicorn": {
                "handlers": ["default"],
                "level": settings.log_level,
                "propagate": False,
            },
            "uvicorn.error": {"level": settings.log_level},
            "uvicorn.access": {
                "handlers": ["access"],
                "level": settings.log_level,
                "propagate": False,
            },
        },
    }
