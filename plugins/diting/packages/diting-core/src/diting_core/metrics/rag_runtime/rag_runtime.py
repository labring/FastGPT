#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from dataclasses import dataclass
from typing import Type, cast, Optional, Any
from diting_core.cases.llm_case import LLMCase
from diting_core.callbacks.base import Callbacks
from diting_core.metrics.answer_similarity.answer_similarity import AnswerSimilarity
from diting_core.metrics.answer_correctness.answer_correctness import AnswerCorrectness
from diting_core.metrics.context_recall.context_recall import ContextRecall
from diting_core.metrics.faithfulness.faithfulness import Faithfulness
from diting_core.metrics.base_metric import MetricValue, BaseMetric

from diting_core.metrics.rag_runtime.template import (
    CriticPromptTemplate,
    ProblemLocation,
)
from diting_core.metrics.rag_runtime.schema import (
    EvaluationResult,
    Verdicts,
    EVALUATION_SCORES,
)
from diting_core.models.llms.base_model import BaseLLM
from diting_core.models.embeddings.base_model import BaseEmbeddings


@dataclass
class RagRuntime(BaseMetric):
    model: Optional[BaseLLM] = None
    embedding_model: Optional[BaseEmbeddings] = None
    answer_correctness_threshold: float = 0.85
    context_recall_threshold: float = 0.9
    faithfulness_threshold: float = 0.9
    evaluation_template: Type[CriticPromptTemplate] = CriticPromptTemplate
    problem_location: Type[ProblemLocation] = ProblemLocation

    async def _evaluate_answer_correctness(self, test_case: LLMCase) -> MetricValue:
        assert self.embedding_model is not None, "embedding model is not set"
        assert self.model is not None, "llm is not set"
        answer_similarity = AnswerSimilarity(embedding_model=self.embedding_model)
        answer_correctness = AnswerCorrectness(
            model=self.model, weights=[0.8, 0.2], answer_similarity=answer_similarity
        )
        metric_value = await answer_correctness.compute(test_case)
        return metric_value

    async def _evaluate_context_recall(self, test_case: LLMCase) -> MetricValue:
        assert self.model is not None, "llm is not set"
        context_recall = ContextRecall(model=self.model)
        metric_value = await context_recall.compute(test_case)
        return metric_value

    async def _evaluate_faithfulness(self, test_case: LLMCase) -> MetricValue:
        assert self.model is not None, "llm is not set"
        faithfulness = Faithfulness(model=self.model)
        metric_value = await faithfulness.compute(test_case)
        return metric_value

    async def _compute(
        self,
        test_case: LLMCase,
        *args: Any,
        callbacks: Optional[Callbacks] = None,
        **kwargs: Any,
    ) -> MetricValue:
        assert test_case.user_input, "user_input cannot be empty"
        assert test_case.actual_output, "actual_output cannot be empty"
        assert test_case.expected_output, "expected_output cannot be empty"
        assert test_case.retrieval_context, "retrieval_context cannot be empty"
        assert self.model is not None, "llm is not set"
        run_logs: dict[str, Any] = {
            "answer_correctness": await self._evaluate_answer_correctness(test_case)
        }
        answer_correctness_score = run_logs["answer_correctness"].score
        assert answer_correctness_score, "answer_correctness_score cannot be None"
        if answer_correctness_score >= self.answer_correctness_threshold:
            run_logs["result"] = EvaluationResult.ACCURACY
            score = EVALUATION_SCORES[EvaluationResult.ACCURACY.lower()]
            metric_value = MetricValue(score=score, run_logs=run_logs)
            return metric_value

        run_logs["context_recall"] = await self._evaluate_context_recall(test_case)
        context_recall_score = run_logs["context_recall"].score
        assert context_recall_score, "context_recall_score cannot be None"
        if context_recall_score >= self.context_recall_threshold:
            prompt = self.evaluation_template.critic_accuracy_with_high_recall(
                query=test_case.user_input,
                answer=test_case.actual_output,
                expect_answer=test_case.expected_output,
                retrieved_contexts=test_case.retrieval_context,
                answer_accuracy_score=answer_correctness_score,
                context_recall_score=context_recall_score,
            )
            critic_result: Verdicts = cast(
                Verdicts,
                await self.model.generate_structured_output(
                    prompt=prompt, schema=Verdicts
                ),
            )
            run_logs["critic"] = critic_result
            if critic_result.result.lower() == EvaluationResult.ACCURACY.lower():
                run_logs["result"] = EvaluationResult.ACCURACY
                run_logs["reason"] = critic_result.reason
                score = EVALUATION_SCORES[EvaluationResult.ACCURACY.lower()]
                metric_value = MetricValue(score=score, run_logs=run_logs)
                return metric_value

            run_logs["faithfulness"] = await self._evaluate_faithfulness(test_case)
            faithfulness_score = run_logs["faithfulness"].score
            assert faithfulness_score, "faithfulness_score cannot be None"
            if (
                faithfulness_score >= self.faithfulness_threshold
                and context_recall_score >= self.context_recall_threshold
            ):
                # RETRIEVAL_CONTEXT_NOISE, INCOMPLETE_OUTPUT
                expected = {
                    EvaluationResult.RETRIEVAL_CONTEXT_NOISE.lower(),
                    EvaluationResult.INCOMPLETE_OUTPUT.lower(),
                }
                prompt = self.problem_location.problem_location_v1(
                    query=test_case.user_input,
                    answer=test_case.actual_output,
                    expect_answer=test_case.expected_output,
                    retrieved_contexts=test_case.retrieval_context,
                    context_recall_score=context_recall_score,
                    faithfulness_score=faithfulness_score,
                    reason=critic_result.reason,
                )
                problem_location_result: Verdicts = cast(
                    Verdicts,
                    await self.model.generate_structured_output(
                        prompt=prompt, schema=Verdicts
                    ),
                )
                run_logs["problem_location"] = problem_location_result
                if problem_location_result.result.lower() in expected:
                    run_logs["result"] = problem_location_result.result
                    score = EVALUATION_SCORES[problem_location_result.result.lower()]
                    run_logs["reason"] = problem_location_result.reason
                else:
                    run_logs["result"] = EvaluationResult.RETRIEVAL_CONTEXT_NOISE
                    score = EVALUATION_SCORES[
                        EvaluationResult.RETRIEVAL_CONTEXT_NOISE.lower()
                    ]
                    run_logs["reason"] = EvaluationResult.UNKNOWN
                metric_value = MetricValue(score=score, run_logs=run_logs)
                return metric_value
            else:
                # FABRICATE_OUTPUT，RETRIEVAL_CONTEXT_NOISE.，INCOMPLETE_RETRIEVAL_CONTEXT
                expected = {
                    EvaluationResult.FABRICATE_OUTPUT.lower(),
                    EvaluationResult.RETRIEVAL_CONTEXT_NOISE.lower(),
                    EvaluationResult.INCOMPLETE_RETRIEVAL_CONTEXT.lower(),
                }
                prompt = self.problem_location.problem_location_v2(
                    query=test_case.user_input,
                    answer=test_case.actual_output,
                    expect_answer=test_case.expected_output,
                    retrieved_contexts=test_case.retrieval_context,
                    context_recall_score=context_recall_score,
                    faithfulness_score=faithfulness_score,
                    reason=critic_result.reason,
                )
                problem_location_result: Verdicts = cast(
                    Verdicts,
                    await self.model.generate_structured_output(
                        prompt=prompt, schema=Verdicts
                    ),
                )
                run_logs["problem_location"] = problem_location_result
                if problem_location_result.result.lower() in expected:
                    run_logs["result"] = problem_location_result.result
                    score = EVALUATION_SCORES[problem_location_result.result.lower()]
                    run_logs["reason"] = problem_location_result.reason
                else:
                    run_logs["result"] = EvaluationResult.FABRICATE_OUTPUT
                    score = EVALUATION_SCORES[EvaluationResult.FABRICATE_OUTPUT.lower()]
                    run_logs["reason"] = EvaluationResult.UNKNOWN
                metric_value = MetricValue(score=score, run_logs=run_logs)
                return metric_value

        # Low correctness score and answer recall suggest a possible retrieval issue.
        prompt = self.problem_location.problem_location_v3(
            query=test_case.user_input,
            answer=test_case.actual_output,
            expect_answer=test_case.expected_output,
            retrieved_contexts=test_case.retrieval_context,
            answer_accuracy_score=answer_correctness_score,
            context_recall_score=context_recall_score,
        )
        expected = {
            EvaluationResult.ACCURACY.lower(),
            EvaluationResult.NO_RETRIEVAL_CONTEXT.lower(),
            EvaluationResult.INCOMPLETE_RETRIEVAL_CONTEXT.lower(),
        }
        problem_location_result: Verdicts = cast(
            Verdicts,
            await self.model.generate_structured_output(prompt=prompt, schema=Verdicts),
        )
        run_logs["problem_location"] = problem_location_result
        if problem_location_result.result.lower() in expected:
            run_logs["result"] = problem_location_result.result
            score = EVALUATION_SCORES[problem_location_result.result.lower()]
            run_logs["reason"] = problem_location_result.reason
        else:
            run_logs["result"] = EvaluationResult.INCOMPLETE_RETRIEVAL_CONTEXT
            score = EVALUATION_SCORES[
                EvaluationResult.INCOMPLETE_RETRIEVAL_CONTEXT.lower()
            ]
            run_logs["reason"] = EvaluationResult.UNKNOWN
        metric_value = MetricValue(score=score, run_logs=run_logs)
        return metric_value
