#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import functools
import uuid
from contextvars import copy_context
from typing import Any, Optional, cast, Callable, Union, Self, TypeVar, Tuple
from uuid import UUID

from diting_core.callbacks.base import (
    BaseCallbackManager,
    Callbacks,
    BaseCallbackHandler,
    logger,
    ChainManagerMixin,
)
from diting_core.callbacks.stdout import StdOutCallbackHandler

Func = TypeVar("Func", bound=Callable[..., Any])


def shielded(func: Func) -> Func:
    """Makes so an awaitable method is always shielded from cancellation.

    Args:
        func (Callable): The function to shield.

    Returns:
        Callable: The shielded function
    """

    @functools.wraps(func)
    async def wrapped(*args: Any, **kwargs: Any) -> Any:
        return await asyncio.shield(func(*args, **kwargs))

    return cast("Func", wrapped)


class BaseRunManager:
    """Base class for run manager (a bound callback manager)."""

    def __init__(
        self,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        handlers: list[BaseCallbackHandler],
        tags: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        """Initialize the run manager.

        Args:
            run_id (UUID): The ID of the run.
            parent_run_id (UUID, optional): The ID of the parent run.
                Defaults to None.
            handlers (list[BaseCallbackHandler]): The list of handlers.
            tags (Optional[list[str]]): The list of tags. Defaults to None.
            metadata (Optional[dict[str, Any]]): The metadata.
                Defaults to None.
        """
        self.run_id = run_id
        self.parent_run_id = parent_run_id
        self.handlers = handlers
        self.tags = tags or []
        self.metadata = metadata or {}

    @classmethod
    def get_noop_manager(cls) -> Self:
        """Return a manager that doesn't perform any operations.

        Returns:
            BaseRunManager: The noop manager.
        """
        return cls(
            run_id=uuid.uuid4(),
            handlers=[],
            tags=[],
            metadata={},
        )


class AsyncParentRunManager(BaseRunManager):
    """Async Parent Run Manager."""

    def get_child(self, tag: Optional[str] = None) -> AsyncCallbackManager:
        """Get a child callback manager.

        Args:
            tag (str, optional): The tag for the child callback manager.
                Defaults to None.

        Returns:
            AsyncCallbackManager: The child callback manager.
        """
        manager = AsyncCallbackManager(handlers=[], parent_run_id=self.run_id)
        manager.set_handlers(self.handlers)
        manager.add_tags(self.tags)
        manager.add_metadata(self.metadata)
        if tag is not None:
            manager.add_tags([tag])
        return manager


class AsyncCallbackManagerForChainRun(AsyncParentRunManager, ChainManagerMixin):
    """Async callback manager for chain run."""

    @shielded
    async def on_chain_end(
        self, outputs: Union[dict[str, Any], Any], **kwargs: Any
    ) -> None:
        """Run when a chain ends running.

        Args:
            outputs (Union[dict[str, Any], Any]): The outputs of the chain.
            **kwargs (Any): Additional keyword arguments.
        """
        if not self.handlers:
            return
        await ahandle_event(
            self.handlers,
            "on_chain_end",
            outputs,
            run_id=self.run_id,
            parent_run_id=self.parent_run_id,
            tags=self.tags,
            metadata=self.metadata,
            **kwargs,
        )

    @shielded
    async def on_chain_error(
        self,
        error: BaseException,
        **kwargs: Any,
    ) -> None:
        """Run when chain errors.

        Args:
            error (Exception or KeyboardInterrupt): The error.
            **kwargs (Any): Additional keyword arguments.
        """
        if not self.handlers:
            return
        await ahandle_event(
            self.handlers,
            "on_chain_error",
            error,
            run_id=self.run_id,
            parent_run_id=self.parent_run_id,
            tags=self.tags,
            metadata=self.metadata,
            **kwargs,
        )


class AsyncCallbackManager(BaseCallbackManager):
    """Callback manager for DiTing."""

    @property
    def is_async(self) -> bool:
        """Return whether the handler is async."""
        return True

    async def on_chain_start(
        self,
        serialized: Optional[dict[str, Any]],
        inputs: Union[dict[str, Any], Any],
        run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> AsyncCallbackManagerForChainRun:
        """Async run when chain starts running.

        Args:
            serialized (Optional[dict[str, Any]]): The serialized chain.
            inputs (Union[dict[str, Any], Any]): The inputs to the chain.
            run_id (UUID, optional): The ID of the run. Defaults to None.
            **kwargs (Any): Additional keyword arguments.

        Returns:
            AsyncCallbackManagerForChainRun: The async callback manager
                for the chain run.
        """
        if run_id is None:
            run_id = uuid.uuid4()

        await ahandle_event(
            self.handlers,
            "on_chain_start",
            serialized,
            inputs,
            run_id=run_id,
            parent_run_id=self.parent_run_id,
            tags=self.tags,
            metadata=self.metadata,
            **kwargs,
        )

        return AsyncCallbackManagerForChainRun(
            run_id=run_id,
            parent_run_id=self.parent_run_id,
            handlers=self.handlers,
            tags=self.tags,
            metadata=self.metadata,
        )

    @classmethod
    def configure(
        cls,
        callbacks: Callbacks = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
        *,
        verbose: bool = False,
    ) -> AsyncCallbackManager:
        """Configure the async callback manager.

        Args:
            callbacks (Optional[Callbacks], optional): The local callbacks.
                Defaults to None.
            verbose (bool, optional): Whether to enable verbose mode. Defaults to False.
            tags (Optional[list[str]], optional): The local tags. Defaults to None.
            metadata (Optional[dict[str, Any]], optional): The local metadata.
                Defaults to None.

        Returns:
            AsyncCallbackManager: The configured callback manager.
        """
        callback_manager = AsyncCallbackManager(handlers=[])
        local_handlers_ = (
            callbacks
            if isinstance(callbacks, list)
            else (callbacks.handlers if callbacks else [])
        )
        for handler in local_handlers_:
            callback_manager.add_handler(handler)
        if tags:
            callback_manager.add_tags(tags or [])
        if metadata:
            callback_manager.add_metadata(metadata or {})

        if verbose and not any(
            isinstance(handler, StdOutCallbackHandler)
            for handler in callback_manager.handlers
        ):
            callback_manager.add_handler(StdOutCallbackHandler())

        return callback_manager


class AsyncCallbackManagerForChainGroup(AsyncCallbackManager):
    """Async callback manager for the chain group."""

    def __init__(
        self,
        handlers: list[BaseCallbackHandler],
        parent_run_id: Optional[UUID] = None,
        *,
        parent_run_manager: AsyncCallbackManagerForChainRun,
        **kwargs: Any,
    ) -> None:
        """Initialize the async callback manager.

        Args:
            handlers (List[BaseCallbackHandler]): The list of handlers.
            parent_run_id (Optional[UUID]): The ID of the parent run. Defaults to None.
            parent_run_manager (AsyncCallbackManagerForChainRun):
                The parent run manager.
            **kwargs (Any): Additional keyword arguments.
        """
        super().__init__(
            handlers,
            parent_run_id,
            **kwargs,
        )
        self.parent_run_manager = parent_run_manager
        self.ended = False

    def copy(self) -> AsyncCallbackManagerForChainGroup:
        """Copy the async callback manager."""
        return self.__class__(
            handlers=self.handlers.copy(),
            parent_run_id=self.parent_run_id,
            tags=self.tags.copy(),
            metadata=self.metadata.copy(),
            parent_run_manager=self.parent_run_manager,
        )

    async def on_chain_end(
        self, outputs: Union[dict[str, Any], Any], **kwargs: Any
    ) -> None:
        """Run when traced chain group ends.

        Args:
            outputs (Union[Dict[str, Any], Any]): The outputs of the chain.
            **kwargs (Any): Additional keyword arguments.
        """
        self.ended = True
        await self.parent_run_manager.on_chain_end(outputs, **kwargs)

    async def on_chain_error(
        self,
        error: BaseException,
        **kwargs: Any,
    ) -> None:
        """Run when chain errors.

        Args:
            error (Exception or KeyboardInterrupt): The error.
            **kwargs (Any): Additional keyword arguments.
        """
        self.ended = True
        await self.parent_run_manager.on_chain_error(error, **kwargs)


async def ahandle_event(
    handlers: list[BaseCallbackHandler],
    event_name: str,
    *args: Any,
    **kwargs: Any,
) -> None:
    """Async generic event handler for AsyncCallbackManager.

    Note: This function is used by DiTing to handle events.

    Args:
        handlers: The list of handlers that will handle the event.
        event_name: The name of the event (e.g., "on_llm_start").
        *args: The arguments to pass to the event handler.
        **kwargs: The keyword arguments to pass to the event handler.
    """
    for handler in [h for h in handlers if h.run_inline]:
        await _ahandle_event_for_handler(handler, event_name, *args, **kwargs)
    await asyncio.gather(
        *(
            _ahandle_event_for_handler(
                handler,
                event_name,
                *args,
                **kwargs,
            )
            for handler in handlers
            if not handler.run_inline
        )
    )


async def _ahandle_event_for_handler(
    handler: BaseCallbackHandler,
    event_name: str,
    *args: Any,
    **kwargs: Any,
) -> None:
    try:
        event = getattr(handler, event_name)
        if asyncio.iscoroutinefunction(event):
            await event(*args, **kwargs)
        elif handler.run_inline:
            event(*args, **kwargs)
        else:
            await asyncio.get_event_loop().run_in_executor(
                None,
                cast(
                    Callable[..., Any],
                    functools.partial(copy_context().run, event, *args, **kwargs),
                ),
            )
    except NotImplementedError as e:
        logger.warning(
            "NotImplementedError in %s.%s callback: %s",
            handler.__class__.__name__,
            event_name,
            repr(e),
        )
    except Exception as e:
        logger.warning(
            "Error in %s.%s callback: %s",
            handler.__class__.__name__,
            event_name,
            repr(e),
        )
        if handler.raise_error:
            raise


async def new_group(
    name: str,
    inputs: dict[str, Any],
    callbacks: Optional[Callbacks],
    tags: Optional[list[str]] = None,
    metadata: Optional[dict[str, Any]] = None,
    verbose: bool = False,
    **kwargs: Any,
) -> Tuple[AsyncCallbackManagerForChainRun, AsyncCallbackManagerForChainGroup]:
    """Create and initialize a new asynchronous chain group callback manager.

    This function establishes a hierarchical callback structure for tracking
    chain execution flows. It creates:
    1. A root callback manager (rm) for tracking the overall chain group
    2. A group callback manager (group_cm) for handling child chain operations

    The function triggers the chain group start callback and establishes
    parent-child relationships between managers.

    Args:
        name (str): Identifier for the chain group (e.g., "Payment Processing")
        inputs (dict): Input parameters dictionary (passed to on_chain_start)
        callbacks (Callbacks): Callback handlers list or existing manager
        tags (Optional[list]): Additional tags for tracking (default: empty list)
        metadata (Optional[dict]): Additional metadata for tracking (default: empty dict)
        verbose (bool): Enable visualization of the process

    Returns:
        Tuple[AsyncCallbackManagerForChainRun, AsyncCallbackManagerForChainGroup]:
        - First element: Root manager tracking the entire workflow
        - Second element: Group manager for child workflow operations

    Example Usage:
        async def root_func(root_arg: str, callbacks: Callbacks) -> str:
            # Create root group with initial inputs
            cm, grp_cb = await new_group("root", {"root_inputs": root_arg}, callbacks)

            # Execute parent function with group callback
            outputs = await parent_func(root_arg, grp_cb)

            # Finalize root workflow
            await cm.on_chain_end(outputs={"root_outputs": outputs})
            return outputs

        async def parent_func(parent_arg: str, callbacks: Callbacks) -> str:
            # Create parent group with its own inputs
            cm, grp_cb = await new_group("parent", {"parent_inputs": parent_arg}, callbacks)

            # Execute child functions with group callback
            output1 = await child1_func(parent_arg, grp_cb)
            output2 = await child2_func(parent_arg, grp_cb)

            # Combine results and finalize parent workflow
            outputs = f"child1:{output1}, child2:{output2}"
            await cm.on_chain_end(outputs={"parent_outputs": outputs})
            return outputs

    Note:
        The group_manager automatically notifies the root_manager upon completion.
        This enables proper hierarchical tracking in nested async workflows.
        Error handling in child functions (like in child1_func and child2_func)
        demonstrates how exceptions are propagated through the callback chain.
    """
    tags = tags or []
    metadata = metadata or {}
    callbacks = callbacks or []

    # Initialize callback manager based on input type
    if isinstance(callbacks, list):
        cm = AsyncCallbackManager.configure(callbacks=callbacks, verbose=verbose)
    else:
        cm = cast(AsyncCallbackManager, callbacks)

    # Apply tags and metadata to the manager
    cm.tags = tags
    cm.metadata = metadata

    # Start the root chain execution
    rm = await cm.on_chain_start({"name": name}, inputs, **kwargs)

    # Create child manager for nested chain operations
    child_cm = rm.get_child()
    group_cm = AsyncCallbackManagerForChainGroup(
        child_cm.handlers,
        child_cm.parent_run_id,
        parent_run_manager=rm,
        tags=child_cm.tags,
        metadata=child_cm.metadata,
    )

    return rm, group_cm
