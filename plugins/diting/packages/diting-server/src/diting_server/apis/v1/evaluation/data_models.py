#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from pydantic import Field
from enum import Enum
from typing import Optional, Dict, Any, List
from diting_server.common.schema import Usage, StatusEnum, BaseSchema


class EvalMetricTypeEnum(str, Enum):
    Custom = "custom_metric"
    Builtin = "builtin_metric"


class ModelConfig(BaseSchema):
    name: str = Field(..., description="模型名称")
    base_url: Optional[str] = Field(None, description="模型API基础URL")
    api_key: Optional[str] = Field(None, description="API密钥")
    parameters: Optional[Dict[str, Any]] = Field(None, description="模型参数")
    timeout: Optional[int] = Field(600, description="超时时间(秒)")


class MetricConfig(BaseSchema):
    metric_name: str = Field(..., description="指标名称")
    prompt: Optional[str] = Field("", description="评估提示词")
    metric_type: EvalMetricTypeEnum = Field(
        EvalMetricTypeEnum.Builtin, description="指标类型"
    )


class MetricDefinition(BaseSchema):
    """Complete metric configuration"""

    name: str = Field(..., description="Unique identifier for the metric")
    description: str = Field(
        ..., description="Human-readable description of what the metric measures"
    )
    require_user_input: bool = Field(False, description="Is required input")
    require_actual_output: bool = Field(False, description="Is required actual_output")
    require_expected_output: bool = Field(
        False, description="Is required expected_output"
    )
    require_context: bool = Field(False, description="Is required context")
    require_retrieval_context: bool = Field(
        False, description="Is required retrieval_context"
    )


class EvalCase(BaseSchema):
    user_input: Optional[str] = Field(None, description="用户输入")
    actual_output: Optional[str] = Field(None, description="实际输出")
    expected_output: Optional[str] = Field(None, description="期望输出")
    context: Optional[List[str]] = Field(None, description="上下文")
    retrieval_context: Optional[List[str]] = Field(None, description="检索上下文")
    metadata: Optional[Dict[str, Any]] = Field(None, description="元数据")


class EvaluationRequest(BaseSchema):
    llm_config: ModelConfig = Field(..., description="llm模型配置")
    embedding_config: Optional[ModelConfig] = Field(
        None, description="embedding模型配置"
    )
    metric_config: MetricConfig = Field(..., description="指标配置")
    eval_case: EvalCase = Field(..., description="输入数据")


class EvaluationResult(BaseSchema):
    metric_name: str = Field(..., description="指标名称")
    score: float = Field(..., description="评估分数", ge=0.0, le=1.0)
    reason: Optional[str] = Field(None, description="详细说明")
    run_logs: Optional[Dict[str, Any]] = Field(None, description="运行日志")


class EvaluationResponse(BaseSchema):
    request_id: str = Field(..., description="请求唯一标识符")
    status: StatusEnum = Field(..., description="评估状态")
    data: Optional[EvaluationResult] = Field(None, description="评估结果")
    usages: Optional[List[Usage]] = Field(None, description="token使用情况")
    error: Optional[str] = Field(None, description="错误信息")
