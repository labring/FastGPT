#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import List
from pydantic import BaseModel, Field


class Statements(BaseModel):
    statements: List[str] = Field(description="The generated statements")


class FaithfulnessVerdict(BaseModel):
    statement: str = Field(..., description="the original statement, word-by-word")
    reason: str = Field(..., description="the reason of the verdict")
    verdict: int = Field(..., description="the verdict(0/1) of the faithfulness.")


class Verdicts(BaseModel):
    verdicts: List[FaithfulnessVerdict]


class Reason(BaseModel):
    reason: str
