from pydantic import BaseModel, Field


class CustomMetricVerdict(BaseModel):
    score: float = Field(..., ge=0, le=1, description="评分，范围在0到1之间")
    reason: str = Field(
        default="", description="评分理由", json_schema_extra={"required": True}
    )
