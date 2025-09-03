from pydantic import BaseModel


class CustomMetricVerdict(BaseModel):
    score: float
    reason: str
