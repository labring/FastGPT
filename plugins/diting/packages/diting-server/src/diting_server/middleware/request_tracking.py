#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Request tracking middleware for diting_server.
Generates UUID and marks request type (eval/synthesis).
"""

import uuid
import time
from typing import Awaitable, MutableMapping, Any
from starlette.types import ASGIApp, Scope, Receive, Send, Message
from starlette.datastructures import Headers, MutableHeaders

from diting_server.common.logging_config.config import get_logger

logger = get_logger(__name__)


class XRequestIdMiddleware:
    """
    Middleware that sets the X-Request-Id header for each response
    to a random uuid4 (hex) value if the header isn't already
    present in the request, otherwise use the provided request id.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    def __call__(self, scope: Scope, receive: Receive, send: Send) -> Awaitable[None]:
        if scope["type"] not in ("http", "websocket"):
            return self.app(scope, receive, send)

        # Extract the request headers
        request_headers = Headers(scope=scope)

        # Determine request type based on path
        path = scope.get("path", "")
        request_type = self._determine_request_type(path)

        # Get or generate request ID with prefix based on request type
        existing_id = request_headers.get("X-Request-Id")
        if existing_id:
            request_id = existing_id
        else:
            # Generate ID with prefix based on request type
            prefix = self._get_id_prefix(request_type)
            request_id = f"{prefix}-{uuid.uuid4().hex}"

        # Store request_id in scope for API layer access (safer than modifying headers)
        scope["diting_request_id"] = request_id
        scope["diting_request_type"] = request_type

        # Log request start
        start_time = time.perf_counter()
        logger.info(
            "Request started",
            request_id=request_id,
            request_type=request_type,
            method=scope.get("method", ""),
            path=path,
            client_ip=scope.get("client", [None, None])[0]
            if scope.get("client")
            else None,
        )

        # Track status code via a mutable reference captured by closure
        status_code_ref = {"value": None}

        async def send_with_request_id(message: Message) -> None:
            """
            Custom send function to mutate the response headers
            and append X-Request-Id and X-Request-Type to it.
            """
            if message["type"] == "http.response.start":
                response_headers = MutableHeaders(raw=message["headers"])
                response_headers.append("X-Request-Id", request_id)
                response_headers.append("X-Request-Type", request_type)
                # Record status code for completion log
                status_code_ref["value"] = message.get("status", None)
            elif message["type"] == "http.response.body":
                # If this is the final body chunk, log completion
                more_body = message.get("more_body", False)
                if not more_body:
                    duration_s = time.perf_counter() - start_time
                    status_code = status_code_ref["value"]
                    logger.info(
                        "Request completed",
                        request_id=request_id,
                        status_code=status_code,
                        duration_s=round(duration_s, 3),
                    )
            await send(message)

        return self.app(scope, receive, send_with_request_id)

    def _determine_request_type(self, path: str) -> str:
        """
        Determine request type based on the request path.
        """
        return _determine_request_type_from_path(path)

    def _get_id_prefix(self, request_type: str) -> str:
        """
        Get ID prefix based on request type.
        """
        return _get_id_prefix_for_type(request_type)


# For backward compatibility, keep the old class name
RequestTrackingMiddleware = XRequestIdMiddleware


# Utility functions
def _determine_request_type_from_path(path: str) -> str:
    """
    Determine request type based on the request path.
    """
    if "/evaluations" in path:
        return "eval"
    elif "/dataset-synthesis" in path:
        return "synthesis"
    elif "/healthz" in path:
        return "health"
    else:
        return "other"


def _get_id_prefix_for_type(request_type: str) -> str:
    """
    Get ID prefix based on request type.
    """
    prefix_map = {
        "eval": "eval",
        "synthesis": "synth",
        "health": "health",
        "other": "req",
    }
    return prefix_map.get(request_type, "req")


# Public API functions
def get_request_id_from_scope(scope: MutableMapping[str, Any]) -> str:
    """
    Get the request ID from scope (set by middleware).
    This is safer than modifying request headers.
    """
    return scope.get("diting_request_id", "unknown")
