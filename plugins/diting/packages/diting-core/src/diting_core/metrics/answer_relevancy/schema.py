from typing import List, Optional, Literal
from pydantic import BaseModel, Field


class Statements(BaseModel):
    statements: List[str]


class AnswerRelevancyVerdict(BaseModel):
    verdict: Literal["yes", "no", "idk"]
    reason: Optional[str] = Field(default=None)


class Verdicts(BaseModel):
    verdicts: List[AnswerRelevancyVerdict]


class Reason(BaseModel):
    reason: str
