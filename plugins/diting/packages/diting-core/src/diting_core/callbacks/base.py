#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Base callback handler for DiTing."""

from __future__ import annotations

import time
from datetime import datetime, timezone
import logging
from enum import Enum
from typing import Any, Optional, Union, Dict, List, Sequence
from uuid import UUID

from pydantic import BaseModel, Field
from typing_extensions import Self

logger = logging.getLogger(__name__)


class CallbackManagerMixin:
    """Mixin for callback manager."""

    def on_chain_start(
        self,
        serialized: dict[str, Any],
        inputs: dict[str, Any],
        *,
        run_id: UUID,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """Run when a chain starts running.

        Args:
            serialized (dict[str, Any]): The serialized chain.
            inputs (dict[str, Any]): The inputs.
            run_id (UUID): The run ID. This is the ID of the current run.
            tags (Optional[list[str]]): The tags.
            metadata (Optional[dict[str, Any]]): The metadata.
            kwargs (Any): Additional keyword arguments.
        """


class ChainManagerMixin:
    """Mixin for run manager."""

    def on_chain_end(
        self,
        outputs: dict[str, Any],
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> Any:
        """Run when chain ends running.

        Args:
            outputs (dict[str, Any]): The outputs of the chain.
            run_id (UUID): The run ID. This is the ID of the current run.
            kwargs (Any): Additional keyword arguments.
        """

    def on_chain_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> Any:
        """Run when chain errors.

        Args:
            error (BaseException): The error that occurred.
            run_id (UUID): The run ID. This is the ID of the current run.
            kwargs (Any): Additional keyword arguments.
        """


class BaseCallbackHandler(CallbackManagerMixin, ChainManagerMixin):
    """Base callback handler for DiTing."""

    raise_error: bool = False
    """Whether to raise an error if an exception occurs."""

    run_inline: bool = False
    """Whether to run the callback inline."""


class AsyncCallbackHandler(BaseCallbackHandler):
    """Async callback handler for DiTing."""

    async def on_chain_start(
        self,
        serialized: dict[str, Any],
        inputs: dict[str, Any],
        *,
        run_id: UUID,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
        **kwargs: Any,
    ) -> None:
        """Run when a chain starts running.

        Args:
            serialized (dict[str, Any]): The serialized chain.
            inputs (dict[str, Any]): The inputs.
            run_id (UUID): The run ID. This is the ID of the current run.
            tags (Optional[list[str]]): The tags.
            metadata (Optional[dict[str, Any]]): The metadata.
            kwargs (Any): Additional keyword arguments.
        """

    async def on_chain_end(
        self,
        outputs: dict[str, Any],
        *,
        run_id: UUID,
        tags: Optional[list[str]] = None,
        **kwargs: Any,
    ) -> None:
        """Run when a chain ends running.

        Args:
            outputs (dict[str, Any]): The outputs of the chain.
            run_id (UUID): The run ID. This is the ID of the current run.
            tags (Optional[list[str]]): The tags.
            kwargs (Any): Additional keyword arguments.
        """

    async def on_chain_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        tags: Optional[list[str]] = None,
        **kwargs: Any,
    ) -> None:
        """Run when chain errors.

        Args:
            error (BaseException): The error that occurred.
            run_id (UUID): The run ID. This is the ID of the current run.
            tags (Optional[list[str]]): The tags.
            kwargs (Any): Additional keyword arguments.
        """


class BaseCallbackManager(CallbackManagerMixin):
    """Base callback manager for DiTing."""

    def __init__(
        self,
        handlers: list[BaseCallbackHandler],
        parent_run_id: Optional[UUID] = None,
        *,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        """Initialize callback manager.

        Args:
            handlers (list[BaseCallbackHandler]): The handlers.
            parent_run_id (Optional[UUID]): The parent run ID. Default is None.
            tags (Optional[list[str]]): The tags. Default is None.
            metadata (Optional[dict[str, Any]]): The metadata. Default is None.
        """
        self.handlers: list[BaseCallbackHandler] = handlers
        self.parent_run_id: Optional[UUID] = parent_run_id
        self.tags = tags or []
        self.metadata = metadata or {}

    @property
    def is_async(self) -> bool:
        """Whether the callback manager is async."""
        return False

    def copy(self) -> Self:
        """Copy the callback manager."""
        return self.__class__(
            handlers=self.handlers.copy(),
            parent_run_id=self.parent_run_id,
            tags=self.tags.copy(),
            metadata=self.metadata.copy(),
        )

    def add_handler(
        self,
        handler: BaseCallbackHandler,
    ) -> None:
        """Add a handler to the callback manager.

        Args:
            handler (BaseCallbackHandler): The handler to add.
        """
        if handler not in self.handlers:
            self.handlers.append(handler)

    def remove_handler(self, handler: BaseCallbackHandler) -> None:
        """Remove a handler from the callback manager.

        Args:
            handler (BaseCallbackHandler): The handler to remove.
        """
        if handler in self.handlers:
            self.handlers.remove(handler)

    def set_handlers(
        self,
        handlers: Sequence[BaseCallbackHandler],
    ) -> None:
        """Set handlers as the only handlers on the callback manager.

        Args:
            handlers (Sequence[BaseCallbackHandler]): The handlers to set.
        """
        self.handlers = []
        for handler in handlers:
            self.add_handler(handler)

    def set_handler(
        self,
        handler: BaseCallbackHandler,
    ) -> None:
        """Set handler as the only handler on the callback manager.

        Args:
            handler (BaseCallbackHandler): The handler to set.
        """
        self.set_handlers([handler])

    def add_tags(
        self,
        tags: list[str],
    ) -> None:
        """Add tags to the callback manager.

        Args:
            tags (list[str]): The tags to add.
        """
        for tag in tags:
            if tag in self.tags:
                self.remove_tags([tag])
        self.tags.extend(tags)

    def remove_tags(self, tags: list[str]) -> None:
        """Remove tags from the callback manager.

        Args:
            tags (list[str]): The tags to remove.
        """
        for tag in tags:
            self.tags.remove(tag)

    def add_metadata(
        self,
        metadata: dict[str, Any],
    ) -> None:
        """Add metadata to the callback manager.

        Args:
            metadata (dict[str, Any]): The metadata to add.
        """
        self.metadata.update(metadata)

    def remove_metadata(self, keys: list[str]) -> None:
        """Remove metadata from the callback manager.

        Args:
            keys (list[str]): The keys to remove.
        """
        for key in keys:
            self.metadata.pop(key)


Callbacks = Optional[Union[list[BaseCallbackHandler], BaseCallbackManager]]


class ChainType(Enum):
    METRIC = "metric"
    SYNTHETIC = "synthetic"
    LLM = "llm"
    EMBED = "embed"
    CORPORA = "corpora"
    FUNC = "func"


class ChainRun(BaseModel):
    run_id: str
    parent_run_id: Optional[str]
    chain_type: ChainType
    name: str
    inputs: Dict[str, Any]
    metadata: Dict[str, Any]
    outputs: Optional[Dict[str, Any]] = None
    children: Optional[List[str]] = None
    start_counter: float = Field(default_factory=time.perf_counter)
    end_counter: Optional[float] = None
    start_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    end_time: Optional[datetime] = None
