#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from enum import Enum

from diting_server.common.schema import SchemaBase


class HealthStatus(str, Enum):
    healthy = "healthy"
    unhealthy = "unhealthy"
    unreachable = "unreachable"


class HealthCheckResponse(SchemaBase):
    version: str = "v1"
    status: HealthStatus
    timestamp: str
