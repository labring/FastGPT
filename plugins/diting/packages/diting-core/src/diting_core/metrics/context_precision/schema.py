#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from pydantic import BaseModel


class Verdict(BaseModel):
    reason: str
    verdict: int


class Reason(BaseModel):
    reason: str
