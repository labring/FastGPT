#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from dataclasses import field, dataclass
from typing import Type, Any, List, Optional, cast

from diting_core.callbacks.base import Callbacks
from diting_core.callbacks.manager import new_group
from diting_core.cases.llm_case import LLMCase, LLMCaseParams
from diting_core.metrics.base_metric import BaseMetric, MetricValue
from diting_core.metrics.context_recall.template import ContextRecallTemplate
from diting_core.metrics.context_recall.schema import (
    Verdicts,
    ContextRecallVerdict,
    Reason,
)
from diting_core.models.llms.base_model import BaseLLM


@dataclass
class ContextRecall(BaseMetric):
    """
    The ContextRecall metric uses LLM-as-a-judge to measure how effectively your language model utilizes the provided
    retrieval_context to generate the expected_output in a RAG pipeline setting.

    Constraints:
        To use the ContextRecall metric, you'll need to provide the following arguments when creating an LLMTestCase:
        - user_input: The input provided to the model.
        - expected_output: The correct output that the model is expected to generate.
        - retrieval_context: The contextual information retrieved to assist the model in generating the expected output.

    Attributes:
        model (BaseLLM): The model used to compute this metric.
        evaluation_template (Type[ContextRecallTemplate]): The prompt template used for generating verdicts.
    """

    model: Optional[BaseLLM] = None
    _required_params: List[LLMCaseParams] = field(
        default_factory=lambda: [
            LLMCaseParams.USER_INPUT,
            LLMCaseParams.EXPECTED_OUTPUT,
            LLMCaseParams.RETRIEVAL_CONTEXT,
        ]
    )
    include_reason: bool = True
    evaluation_template: Type[ContextRecallTemplate] = ContextRecallTemplate

    @staticmethod
    def _compute_score(verdicts: Verdicts) -> float:
        verdict_list = verdicts.verdicts
        attribution_flags = [1 if item.attributed else 0 for item in verdict_list]

        total_count = len(attribution_flags)
        positive_count = sum(attribution_flags)

        try:
            import numpy as np
        except ImportError:
            raise ImportError(
                "This function requires 'numpy'. Install it with: pip install numpy"
            )

        score = positive_count / total_count if total_count > 0 else np.nan

        return score

    async def _a_generate_verdicts(
        self,
        user_input: str,
        expected_output: str,
        retrieval_context: List[str],
        callbacks: Optional[Callbacks] = None,
    ) -> Verdicts:
        assert self.model is not None, "llm is not set"
        prompt = self.evaluation_template.generate_verdicts(
            user_input=user_input,
            expected_output=expected_output,
            retrieval_context=retrieval_context,
        )
        run_mgt, grp_cb = await new_group(
            name="generate_verdicts",
            inputs={
                "user_input": user_input,
                "expected_output": expected_output,
                "retrieval_context": retrieval_context,
            },
            callbacks=callbacks,
        )
        try:
            verdicts = cast(
                Verdicts,
                await self.model.generate_structured_output(
                    prompt, schema=Verdicts, callbacks=grp_cb
                ),
            )
        except Exception as e:
            await run_mgt.on_chain_error(e)
            raise e
        await run_mgt.on_chain_end(outputs={"verdicts": verdicts})
        return verdicts

    async def _a_generate_reason(
        self,
        expected_output: str,
        score: float,
        verdicts: List[ContextRecallVerdict],
        callbacks: Optional[Callbacks] = None,
    ) -> str:
        assert self.model is not None, "llm is not set"
        supportive_reasons: List[str] = []
        unsupportive_reasons: List[str] = []
        for verdict in verdicts:
            if verdict.attributed == 1:
                supportive_reasons.append(verdict.reason)
            else:
                unsupportive_reasons.append(verdict.reason)

        prompt = self.evaluation_template.generate_reason(
            expected_output=expected_output,
            supportive_reasons=supportive_reasons,
            unsupportive_reasons=unsupportive_reasons,
            score=round(score, 2),
        )
        run_mgt, grp_cb = await new_group(
            name="generate_reason",
            inputs={
                "expected_output": expected_output,
                "score": score,
                "verdicts": verdicts,
            },
            callbacks=callbacks,
        )
        try:
            res = cast(
                Reason,
                await self.model.generate_structured_output(
                    prompt, schema=Reason, callbacks=grp_cb
                ),
            )
        except Exception as e:
            await run_mgt.on_chain_error(e)
            raise e
        await run_mgt.on_chain_end(outputs={"reason": res.reason})
        return res.reason

    async def _compute(
        self,
        test_case: LLMCase,
        *args: Any,
        callbacks: Optional[Callbacks] = None,
        **kwargs: Any,
    ) -> MetricValue:
        assert test_case.user_input, "user_input cannot be empty"
        assert test_case.expected_output, "expected_output cannot be empty"
        assert test_case.retrieval_context, "retrieval_context cannot be empty"

        verdicts = await self._a_generate_verdicts(
            user_input=test_case.user_input,
            expected_output=test_case.expected_output,
            retrieval_context=test_case.retrieval_context,
            callbacks=callbacks,
        )
        score = self._compute_score(verdicts)
        reason = None
        if self.include_reason:
            reason = await self._a_generate_reason(
                test_case.expected_output, score, verdicts.verdicts, callbacks=callbacks
            )
        metric_value = MetricValue(
            score=score,
            reason=reason,
            run_logs={
                "verdicts": verdicts,
            },
        )
        return metric_value
