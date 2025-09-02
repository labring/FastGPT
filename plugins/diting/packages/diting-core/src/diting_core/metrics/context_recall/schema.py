#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import List
from pydantic import BaseModel


class ContextRecallVerdict(BaseModel):
    statement: str
    reason: str
    attributed: int


class Verdicts(BaseModel):
    verdicts: List[ContextRecallVerdict]


class Reason(BaseModel):
    reason: str


if __name__ == "__main__":
    import json

    print(type(Verdicts.model_json_schema()))
    print(type(json.dumps(Verdicts.model_json_schema())))
    print(f"{json.dumps(Verdicts.model_json_schema())}")
