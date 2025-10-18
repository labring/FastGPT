#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import List
from pydantic import BaseModel, Field


class Statements(BaseModel):
    statements: List[str] = Field(description="The generated statements")


class FaithfulnessVerdict(BaseModel):
    statement: str = Field(..., description="the original statement, word-by-word")
    reason: str = Field(
        default="",
        description="the reason of the verdict",
        json_schema_extra={"required": True},
    )
    verdict: int = Field(..., description="the verdict(0/1) of the faithfulness.")


class Verdicts(BaseModel):
    verdicts: List[FaithfulnessVerdict]


class Reason(BaseModel):
    reason: str
