#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import List
from pydantic import BaseModel, Field
from enum import Enum


class EvaluationStrategy(str, Enum):
    LENIENT = "lenient"
    STRICT = "strict"


class Statements(BaseModel):
    statements: List[str] = Field(description="The generated statements")


class StatementsWithReason(BaseModel):
    statement: str = Field(description="The statement content")
    reason: str = Field(
        default="",
        description="The reason for the statement classification",
        json_schema_extra={"required": True},
    )


class Verdicts(BaseModel):
    TP: List[StatementsWithReason]
    FP: List[StatementsWithReason]
    FN: List[StatementsWithReason]


class Reason(BaseModel):
    reason: str


class EvaluationStrategySelection(BaseModel):
    strategy: EvaluationStrategy = Field(description="Selected evaluation strategy")
    reason: str = Field(
        default="",
        description="Reason for strategy selection",
        json_schema_extra={"required": True},
    )


class LenientCorrectnessResult(BaseModel):
    score: float = Field(description="Correctness score, range 0–1", ge=0, le=1)
    reason: str = Field(
        default="",
        description="Reason for the score",
        json_schema_extra={"required": True},
    )
