"""Persistent conversation state and command parsing for the DingTalk bridge."""

from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path


RESET_ALIASES = {"reset", "重置", "清空上下文", "重新开始"}
COMMANDS = {"new", "reset", "clear", "help", "status", "compact", "model", "usage"}


@dataclass(frozen=True)
class Command:
    name: str
    argument: str = ""


@dataclass(frozen=True)
class SessionState:
    base_chat_id: str
    active_chat_id: str
    profile: str = "default"
    turns: int = 0
    input_chars: int = 0
    output_chars: int = 0
    pending_summary: str = ""


def parse_command(question: str) -> Command | None:
    """Recognize bridge commands before forwarding normal questions to FastGPT."""
    text = question.strip()
    if text.lower() in RESET_ALIASES:
        return Command("reset")
    if not text.startswith("/"):
        return None
    parts = text[1:].split(maxsplit=1)
    name = parts[0]
    argument = parts[1] if len(parts) == 2 else ""
    name = name.lower()
    return Command(name if name in COMMANDS else "unknown", argument)


class SessionStore:
    """Keep chat IDs and local usage counters across bridge restarts."""

    def __init__(self, path: str | None = None):
        self.path = path or os.getenv("DINGTALK_STATE_DB", "/data/dingtalk-state.sqlite3")
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute(
                """CREATE TABLE IF NOT EXISTS sessions (
                    base_chat_id TEXT PRIMARY KEY,
                    active_chat_id TEXT NOT NULL,
                    profile TEXT NOT NULL,
                    turns INTEGER NOT NULL,
                    input_chars INTEGER NOT NULL,
                    output_chars INTEGER NOT NULL,
                    pending_summary TEXT NOT NULL
                )"""
            )

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path, timeout=5)

    def get(self, base_chat_id: str) -> SessionState:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM sessions WHERE base_chat_id = ?", (base_chat_id,)
            ).fetchone()
        return SessionState(*row) if row else SessionState(base_chat_id, base_chat_id)

    def save(self, state: SessionState) -> None:
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(base_chat_id) DO UPDATE SET
                    active_chat_id=excluded.active_chat_id,
                    profile=excluded.profile,
                    turns=excluded.turns,
                    input_chars=excluded.input_chars,
                    output_chars=excluded.output_chars,
                    pending_summary=excluded.pending_summary""",
                (
                    state.base_chat_id,
                    state.active_chat_id,
                    state.profile,
                    state.turns,
                    state.input_chars,
                    state.output_chars,
                    state.pending_summary,
                ),
            )
