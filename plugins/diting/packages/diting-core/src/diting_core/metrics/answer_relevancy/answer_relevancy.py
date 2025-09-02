#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from dataclasses import field, dataclass
from typing import Type, Any, List, Optional

from diting_core.callbacks.base import Callbacks
from diting_core.callbacks.manager import new_group
from diting_core.cases.llm_case import LLMCase, LLMCaseParams
from diting_core.metrics.answer_relevancy.schema import (
    AnswerRelevancyVerdict,
    Verdicts,
    Statements,
    Reason,
)
from diting_core.metrics.answer_relevancy.template import AnswerRelevancyTemplate
from diting_core.metrics.base_metric import BaseMetric, MetricValue
from diting_core.models.llms.base_model import BaseLLM


def _calculate_score(verdicts: List[AnswerRelevancyVerdict]) -> float:
    number_of_verdicts = len(verdicts)
    if number_of_verdicts == 0:
        return 1

    relevant_count = 0
    for verdict in verdicts:
        if verdict.verdict.strip().lower() != "no":
            relevant_count += 1

    score = relevant_count / number_of_verdicts
    return score


@dataclass
class AnswerRelevancy(BaseMetric):
    """
    The answer relevancy metric uses LLM-as-a-judge to measure
    the quality of your RAG pipeline's generator by evaluating
    how relevant the actual_output of your LLM application is compared to the provided input.

    Constraints:
        To use the AnswerRelevancy, you'll have to provide the following arguments when creating an LLMTestCase:
        - user_input
        - actual_output
        The user_input and actual_output are required to create an LLMCase (and hence required by all metrics)
        even though they might not be used for metric calculation.

    Attributes:
        model Optional[BaseLLM]: The judge model using in compute this metric.
        evaluation_template (AnswerRelevancyTemplate): The prompt template using in the compute this metric
    """

    model: Optional[BaseLLM] = None
    _required_params: List[LLMCaseParams] = field(
        default_factory=lambda: [
            LLMCaseParams.USER_INPUT,
            LLMCaseParams.ACTUAL_OUTPUT,
        ]
    )
    include_reason: bool = True
    evaluation_template: Type[AnswerRelevancyTemplate] = AnswerRelevancyTemplate

    async def _compute(
        self,
        test_case: LLMCase,
        *args: Any,
        callbacks: Optional[Callbacks] = None,
        **kwargs: Any,
    ) -> MetricValue:
        assert test_case.user_input, "user_input cannot be empty"
        assert test_case.actual_output, "actual_output cannot be empty"

        statements: List[str] = await self._a_generate_statements(
            test_case.actual_output, callbacks
        )
        verdicts: List[AnswerRelevancyVerdict] = await self._a_generate_verdicts(
            test_case.user_input, statements, callbacks
        )
        score = _calculate_score(verdicts)
        reason = None
        if self.include_reason:
            reason = await self._a_generate_reason(
                test_case.user_input, score, verdicts, callbacks=callbacks
            )
        metric_value = MetricValue(
            score=score,
            reason=reason,
            run_logs={
                "statements": statements,
                "verdicts": verdicts,
            },
        )

        return metric_value

    async def _a_generate_statements(
        self,
        actual_output: str,
        callbacks: Optional[Callbacks] = None,
    ) -> List[str]:
        assert self.model is not None, "llm is not set"
        prompt = self.evaluation_template.generate_statements(
            actual_output=actual_output,
        )

        run_mgt, grp_cb = await new_group(
            name="generate_statements",
            inputs={"actual_output": actual_output},
            callbacks=callbacks,
        )

        try:
            res = await self.model.generate_structured_output(
                prompt, schema=Statements, callbacks=grp_cb
            )
            res = Statements.model_validate(res)
            statements = res.statements
        except Exception as e:
            await run_mgt.on_chain_error(e)
            raise e

        await run_mgt.on_chain_end(outputs={"statements": statements})
        return statements

    async def _a_generate_verdicts(
        self,
        user_input: str,
        statements: List[str],
        callbacks: Optional[Callbacks] = None,
    ) -> List[AnswerRelevancyVerdict]:
        assert self.model is not None, "llm is not set"
        if len(statements) == 0:
            return []

        prompt = self.evaluation_template.generate_verdicts(
            user_input=user_input,
            statements=statements,
        )

        run_mgt, grp_cb = await new_group(
            name="generate_verdicts",
            inputs={"user_input": user_input, "statements": statements},
            callbacks=callbacks,
        )
        try:
            res = await self.model.generate_structured_output(
                prompt, schema=Verdicts, callbacks=grp_cb
            )
            res = Verdicts.model_validate(res)
            verdicts = res.verdicts
        except Exception as e:
            await run_mgt.on_chain_error(e)
            raise e

        await run_mgt.on_chain_end(outputs={"verdicts": verdicts})
        return res.verdicts

    async def _a_generate_reason(
        self,
        user_input: str,
        score: float,
        verdicts: List[AnswerRelevancyVerdict],
        callbacks: Optional[Callbacks] = None,
    ) -> str:
        assert self.model is not None, "llm is not set"
        irrelevant_statements: List[str] = []
        for verdict in verdicts:
            if verdict.verdict.strip().lower() == "no":
                irrelevant_statements.append(verdict.reason or "")

        prompt = self.evaluation_template.generate_reason(
            irrelevant_statements=irrelevant_statements,
            input=user_input,
            score=round(score, 2),
        )
        run_mgt, grp_cb = await new_group(
            name="generate_reason",
            inputs={
                "user_input": user_input,
                "score": score,
                "verdicts": verdicts,
            },
            callbacks=callbacks,
        )
        try:
            res = await self.model.generate_structured_output(
                prompt, schema=Reason, callbacks=grp_cb
            )
            res = Reason.model_validate(res)
        except Exception as e:
            await run_mgt.on_chain_error(e)
            raise e
        await run_mgt.on_chain_end(outputs={"reason": res.reason})
        return res.reason
