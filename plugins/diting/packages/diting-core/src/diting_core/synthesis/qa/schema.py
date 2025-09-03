#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from pydantic import BaseModel


class QA(BaseModel):
    question: str
    answer: str


class QAPairs(BaseModel):
    qa_pairs: list[QA]


class QAWithScore(BaseModel):
    QA: QA
    score: float
    reason: str
