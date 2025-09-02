#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import List
from pydantic import BaseModel, Field


class Statements(BaseModel):
    statements: List[str] = Field(description="The generated statements")


class StatementsWithReason(BaseModel):
    statement: str
    reason: str


class Verdicts(BaseModel):
    TP: List[StatementsWithReason]
    FP: List[StatementsWithReason]
    FN: List[StatementsWithReason]


class Reason(BaseModel):
    reason: str
