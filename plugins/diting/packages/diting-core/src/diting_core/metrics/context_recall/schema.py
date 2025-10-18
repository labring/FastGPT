#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import List
from pydantic import BaseModel, Field


class ContextRecallVerdict(BaseModel):
    statement: str
    reason: str = Field(
        default="",
        description="the reason of the verdict",
        json_schema_extra={"required": True},
    )
    attributed: int


class Verdicts(BaseModel):
    verdicts: List[ContextRecallVerdict]


class Reason(BaseModel):
    reason: str


if __name__ == "__main__":
    import json

    # print(type(Verdicts.model_json_schema()))
    # print(type(json.dumps(Verdicts.model_json_schema())))
    print(f"{json.dumps(ContextRecallVerdict.model_json_schema())}")
