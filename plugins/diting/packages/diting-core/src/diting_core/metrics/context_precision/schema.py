#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from pydantic import BaseModel, Field


class Verdict(BaseModel):
    reason: str = Field(
        default="",
        description="the reason of the verdict",
        json_schema_extra={"required": True},
    )
    verdict: int = Field(..., description="the verdict(0/1) of the faithfulness.")


class Reason(BaseModel):
    reason: str
