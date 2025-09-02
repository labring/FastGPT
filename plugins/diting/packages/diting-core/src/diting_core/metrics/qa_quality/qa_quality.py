#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from dataclasses import field, dataclass
from typing import Type, Any, List, Optional

from diting_core.callbacks.base import Callbacks
from diting_core.callbacks.manager import new_group
from diting_core.cases.llm_case import LLMCase, LLMCaseParams
from diting_core.metrics.base_metric import BaseMetric, MetricValue
from diting_core.metrics.qa_quality.schema import QAQualityFeedback
from diting_core.metrics.qa_quality.template import QAQualityTemplate
from diting_core.models.llms.base_model import BaseLLM


@dataclass
class QAQuality(BaseMetric):
    """
    The QA Quality metric uses LLM-as-a-judge to measure
    the quality of your LLMCase's user_input, expected_output and optional context generator by synthesizer

    Constraints:
        To use the QAQuality, you'll have to provide the following arguments when creating an LLMTestCase:
        - user_input
        - expected_output
        - context:optional
        The user_input and expected_output are required to create an LLMCase (and hence required by all metrics)
        even though they might not be used for metric calculation.

    Attributes:
        model (BaseLLM): The judge model using in compute this metric.
        evaluation_template (QAQualityTemplate): The prompt template using in the compute this metric
    """

    model: Optional[BaseLLM] = None
    _required_params: List[LLMCaseParams] = field(
        default_factory=lambda: [
            LLMCaseParams.USER_INPUT,
            LLMCaseParams.EXPECTED_OUTPUT,
        ]
    )

    evaluation_template: Type[QAQualityTemplate] = QAQualityTemplate

    async def _compute(
        self,
        test_case: LLMCase,
        *args: Any,
        callbacks: Optional[Callbacks] = None,
        **kwargs: Any,
    ) -> MetricValue:
        assert test_case.user_input, "user_input cannot be empty"
        assert test_case.expected_output, "expected_output cannot be empty"

        if test_case.context is None or len(test_case.context) <= 0:
            metric_value = await self._generate_quality_without_context(
                test_case.user_input, test_case.expected_output, callbacks
            )
        else:
            metric_value = await self._generate_quality_with_context(
                test_case.user_input,
                test_case.expected_output,
                test_case.context,
                callbacks,
            )
        return metric_value

    async def _generate_quality_without_context(
        self, user_input: str, expected_output: str, callbacks: Callbacks
    ) -> MetricValue:
        assert self.model is not None, "set LLM before use"
        run_mgt, grp_cb = await new_group(
            name="generate_quality_without_context",
            inputs={"user_input": user_input, "expected_output": expected_output},
            callbacks=callbacks,
        )
        try:
            evaluation_question_prompt = (
                self.evaluation_template.evaluate_question_self(user_input)
            )
            question_feedback = await self.model.generate_structured_output(
                evaluation_question_prompt, QAQualityFeedback, callbacks=grp_cb
            )
            question_feedback = QAQualityFeedback.model_validate(question_feedback)

            evaluation_answer_prompt = (
                self.evaluation_template.evaluate_answer_no_context(
                    user_input, expected_output
                )
            )
            answer_feedback = await self.model.generate_structured_output(
                evaluation_answer_prompt, QAQualityFeedback, callbacks=grp_cb
            )
            answer_feedback = QAQualityFeedback.model_validate(answer_feedback)

            feedback = f"问题简洁性/自给自足:\n - {question_feedback.feedback}\n答案合理性:\n -{answer_feedback.feedback}"
            score = round(
                question_feedback.score * 0.5 + answer_feedback.score * 0.5, 1
            )

            metric_value = MetricValue(
                score=score,
                reason=feedback,
                run_logs={
                    "question_feedback": question_feedback,
                    "answer_feedback": answer_feedback,
                },
            )
        except Exception as e:
            await run_mgt.on_chain_error(e)
            raise e

        await run_mgt.on_chain_end(outputs={"metric_value": metric_value})
        return metric_value

    async def _generate_quality_with_context(
        self,
        user_input: str,
        expected_output: str,
        context: List[str],
        callbacks: Callbacks,
    ) -> MetricValue:
        assert self.model is not None, "set LLM before use"
        run_mgt, grp_cb = await new_group(
            name="generate_quality_with_context",
            inputs={
                "user_input": user_input,
                "expected_output": expected_output,
                "context": context,
            },
            callbacks=callbacks,
        )
        try:
            evaluation_question_self_prompt = (
                self.evaluation_template.evaluate_question_self(user_input)
            )
            question_self_feedback = await self.model.generate_structured_output(
                evaluation_question_self_prompt, QAQualityFeedback, callbacks=grp_cb
            )
            question_self_feedback = QAQualityFeedback.model_validate(
                question_self_feedback
            )

            evaluation_question_context_prompt = (
                self.evaluation_template.evaluate_question_with_context(
                    user_input, context
                )
            )
            question_context_feedback = await self.model.generate_structured_output(
                evaluation_question_context_prompt,
                QAQualityFeedback,
                callbacks=grp_cb,
            )
            question_context_feedback = QAQualityFeedback.model_validate(
                question_context_feedback
            )

            evaluation_answer_prompt = (
                self.evaluation_template.evaluate_answer_with_context(
                    user_input, expected_output, context
                )
            )

            answer_feedback = await self.model.generate_structured_output(
                evaluation_answer_prompt, QAQualityFeedback, callbacks=grp_cb
            )
            answer_feedback = QAQualityFeedback.model_validate(answer_feedback)

            feedback = (
                f"问题简洁性/自给自足:\n"
                f" - {question_self_feedback.feedback}\n"
                f"问题和上下文的联系:\n"
                f" - {question_context_feedback.feedback}\n"
                f"答案正确性:\n"
                f" -{answer_feedback.feedback}"
            )
            question_score = round(
                0.4 * question_self_feedback.score
                + 0.6 * question_context_feedback.score,
                1,
            )
            score = min(question_score, answer_feedback.score)

            metric_value = MetricValue(
                score=score,
                reason=feedback,
                run_logs={
                    "question_self_feedback": question_self_feedback,
                    "question_context_feedback": question_context_feedback,
                    "answer_feedback": answer_feedback,
                },
            )
        except Exception as e:
            await run_mgt.on_chain_error(e)
            raise e

        await run_mgt.on_chain_end(outputs={"metric_value": metric_value})
        return metric_value
