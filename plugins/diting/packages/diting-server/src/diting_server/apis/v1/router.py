#!/usr/bin/env python
# -*- coding: utf-8 -*-
from fastapi import APIRouter

from diting_server.apis.v1.healthz.api import router as health_router
from diting_server.apis.v1.evaluation.api import router as evaluation_router
from diting_server.apis.v1.synthesis.api import router as synthesis_router

v1_router = APIRouter(
    prefix="",
)

v1_router.include_router(health_router)
v1_router.include_router(evaluation_router)
v1_router.include_router(synthesis_router)
