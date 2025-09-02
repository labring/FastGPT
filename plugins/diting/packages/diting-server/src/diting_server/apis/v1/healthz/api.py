#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter
from fastapi import status

router = APIRouter(prefix="/api/v1", tags=["health"])


@router.get(
    "/healthz",
    summary="Check the service health",
)
async def health_check() -> dict[str, Any]:
    data = {
        "version": "v1",
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
    }
    return {"code": status.HTTP_200_OK, "msg": "success", "data": data}
