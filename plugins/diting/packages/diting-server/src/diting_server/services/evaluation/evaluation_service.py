#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import Optional, Any, Type
from diting_core.cases.llm_case import LLMCase
from diting_server.apis.v1.evaluation.data_models import (
    EvaluationRequest,
    EvaluationResponse,
    EvaluationResult,
    MetricConfig,
    ModelConfig,
    EvalMetricTypeEnum,
)
from diting_server.services.evaluation.metrics import MetricFactory
from diting_server.common.callback import (
    GetEmbedTokenCallbackHandler,
    GetLLMTokenCallbackHandler,
)
from diting_core.metrics.base_metric import BaseMetric
from diting_core.models.llms.factory import llm_factory
from diting_server.common.logging_config.config import get_logger
from diting_core.models.embeddings.factory import embedding_factory
from diting_server.exceptions.evaluation import (
    ModelConfigException,
    MetricNotFoundException,
)
from diting_server.common.utils import resolve_model_config
from diting_server.common.schema import StatusEnum
from diting_server.common.utils import compute_token_usage

logger = get_logger(__name__)


class EvaluationService:
    async def run_evaluation(
        self, request: EvaluationRequest, request_id: str
    ) -> EvaluationResponse:
        metric_case = LLMCase(
            user_input=request.eval_case.user_input,
            actual_output=request.eval_case.actual_output,
            expected_output=request.eval_case.expected_output,
            context=request.eval_case.context,
            retrieval_context=request.eval_case.retrieval_context,
            metadata=request.eval_case.metadata,
        )
        try:
            result = await self._evaluate_case_with_metric(
                case=metric_case,
                metric_config=request.metric_config,
                llm_config=request.llm_config,
                embedding_config=request.embedding_config,
            )
            eval_result = result.get("metric_value")
            usages = result.get("usages", [])
            error_msg = result.get("error", None)
        except (ModelConfigException, MetricNotFoundException) as e:
            logger.error(f"Error occurred during evaluation {str(e)}")
            raise e
        data = EvaluationResult(
            metric_name=request.metric_config.metric_name,
            score=eval_result.score if eval_result else 0,
            reason=eval_result.reason if eval_result else error_msg,
            run_logs=eval_result.run_logs if eval_result else None,
        )
        status = StatusEnum.FAILED if error_msg else StatusEnum.SUCCESS
        response = EvaluationResponse(
            request_id=f"eval-{request_id}",
            data=data,
            usages=usages,
            status=status,
            error=error_msg,
        )
        return response

    async def _evaluate_case_with_metric(
        self,
        case: LLMCase,
        metric_config: MetricConfig,
        llm_config: Optional[ModelConfig] = None,
        embedding_config: Optional[ModelConfig] = None,
    ) -> dict[str, Any]:
        try:
            if metric_config.metric_type == EvalMetricTypeEnum.Custom.value:
                if not metric_config.prompt:
                    raise ValueError("Custom metric requires a non-empty prompt")
                case.metadata = {"prompt": metric_config.prompt}
                metric_name = EvalMetricTypeEnum.Custom.value
            else:
                metric_name = metric_config.metric_name
            metric: BaseMetric = self._load_metric(metric_name)()
        except Exception as ex:
            logger.error(f"Failed to load metric {str(ex)}")
            raise MetricNotFoundException(
                f"Failed to load the metric {metric_config.metric_name}. "
                "Please ensure that this metric is supported and correctly configured. "
                f"Original error: {str(ex)}"
            )
        is_llm_required = hasattr(metric, "model")
        is_embedding_required = hasattr(metric, "embedding_model")
        callbacks: list[Any] = []
        get_embed_token = GetEmbedTokenCallbackHandler()
        get_llm_token = GetLLMTokenCallbackHandler()
        if is_llm_required and llm_config:
            llm_config_resolved = resolve_model_config(
                model=llm_config.name,
                base_url=llm_config.base_url,
                api_key=llm_config.api_key,
            )
            llm_model = llm_factory(**llm_config_resolved, timeout=llm_config.timeout)
            setattr(metric, "model", llm_model)
            callbacks.append(get_llm_token)
        elif is_llm_required and (not llm_config):
            logger.error(
                f"LLM model is required for metric {metric_config.metric_name}. Configuration missing."
            )
            raise ModelConfigException(
                f"LLM model is required for metric {metric_config.metric_name}. "
                "Please ensure that you have configured the appropriate LLM model."
            )

        if is_embedding_required and embedding_config:
            embedding_config_resolved = resolve_model_config(
                model=embedding_config.name,
                base_url=embedding_config.base_url,
                api_key=embedding_config.api_key,
            )
            embedding_model = embedding_factory(**embedding_config_resolved, timeout=embedding_config.timeout)
            setattr(metric, "embedding_model", embedding_model)
            callbacks.append(get_embed_token)
        elif is_embedding_required and (not embedding_config):
            logger.error(
                f"Embedding model is required for metric {metric_config.metric_name}. Configuration missing."
            )
            raise ModelConfigException(
                f"Embedding model is required for metric {metric_config.metric_name}. "
                "Please ensure that you have configured the appropriate embedding model."
            )
        metric_value = None
        error = None
        try:
            metric_value = await metric.compute(test_case=case, callbacks=callbacks)
        except Exception as ex:
            logger.error(f"Metric compute error: {str(ex)}")
            error = str(ex)
        finally:
            usages = compute_token_usage(
                llm_usages=get_llm_token.usages,
                embed_usages=get_embed_token.usages,
            )

        return {"metric_value": metric_value, "usages": usages, "error": error}

    def _load_metric(self, metric_name: str) -> Type[BaseMetric]:
        metric_factory = MetricFactory()
        metric = metric_factory.create(metric_name)
        return metric


evaluation_service = EvaluationService()
