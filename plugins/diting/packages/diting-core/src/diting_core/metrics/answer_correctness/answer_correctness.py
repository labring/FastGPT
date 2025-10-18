#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from dataclasses import field, dataclass
from typing import Type, Any, List, Optional, cast

from diting_core.callbacks.base import Callbacks
from diting_core.callbacks.manager import new_group
from diting_core.cases.llm_case import LLMCase, LLMCaseParams
from diting_core.metrics.base_metric import BaseMetric, MetricValue
from diting_core.metrics.answer_similarity.answer_similarity import AnswerSimilarity
from diting_core.metrics.answer_correctness.template import AnswerCorrectnessTemplate
from diting_core.metrics.answer_correctness.schema import (
    Statements,
    Verdicts,
    Reason,
    EvaluationStrategySelection,
    EvaluationStrategy,
    LenientCorrectnessResult,
)
from diting_core.metrics.utils import fbeta_score, Language, detect_language
from diting_core.models.llms.base_model import BaseLLM
from diting_core.models.embeddings.base_model import BaseEmbeddings


@dataclass
class AnswerCorrectness(BaseMetric):
    """
    The AnswerCorrectness metric uses LLM-as-a-judge to evaluate the factual accuracy and semantic similarity of the
    actual_output compared to the expected_output in response to a given user_input.

    Constraints:
        To use the AnswerCorrectness metric, you'll need to provide the following arguments when creating an LLMTestCase:
        - user_input:
        - actual_output:
        - expected_output:

    Attributes:
        model (BaseLLM): The model used to compute this metric.
        weights (List[float]): Weights for combining factual accuracy and semantic similarity scores. It is expected to contain exactly two weights.
        beta (float): A parameter that influences the balance between precision and recall in the evaluation of factual correctness.
        answer_similarity (Optional[AnswerSimilarity]): An optional metric for computing semantic similarity between actual and expected outputs.
        evaluation_template (Type[AnswerCorrectnessTemplate]): The prompt template used for evaluating correctness.
    """

    model: Optional[BaseLLM] = None
    embedding_model: Optional[BaseEmbeddings] = None
    _required_params: List[LLMCaseParams] = field(
        default_factory=lambda: [
            LLMCaseParams.USER_INPUT,
            LLMCaseParams.ACTUAL_OUTPUT,
            LLMCaseParams.EXPECTED_OUTPUT,
        ]
    )
    include_reason: bool = True
    weights: List[float] = field(default_factory=lambda: [0.80, 0.20])
    beta: float = 1.0
    answer_similarity: Optional[AnswerSimilarity] = None
    evaluation_template: Type[AnswerCorrectnessTemplate] = AnswerCorrectnessTemplate

    def __post_init__(self):
        if len(self.weights) != 2:
            raise ValueError(
                "Expects a list of two weights. First for factuality, second for semantic similarity"
            )
        if all([w == 0 for w in self.weights]):
            raise ValueError("At least one weight must be non-zero")
        if not all([w >= 0 for w in self.weights]):
            raise ValueError("Weights must be non-negative")

        if type(self.beta) is not float:
            raise ValueError(
                "Beta must be a float. A beta > 1 gives more weight to recall, while beta < 1 favors precision."
            )

    def _compute_statement_presence(self, verdicts: Verdicts) -> float:
        filtered_tp = [v for v in verdicts.TP if v.statement]
        filtered_fp = [v for v in verdicts.FP if v.statement]
        filtered_fn = [v for v in verdicts.FN if v.statement]
        tp = len(filtered_tp)
        fp = len(filtered_fp)
        fn = len(filtered_fn)
        score = fbeta_score(tp, fp, fn, self.beta)
        return score

    async def _a_select_evaluation_strategy(
        self,
        user_input: str,
        expected_output: str,
        actual_output: str,
        language: Language = Language.ENGLISH,
        callbacks: Optional[Callbacks] = None,
    ) -> EvaluationStrategySelection:
        assert self.model is not None, "llm is not set"
        prompt = self.evaluation_template.generate_evaluation_strategy_selection(
            user_input=user_input,
            expected_output=expected_output,
            actual_output=actual_output,
            language=language,
        )
        run_mgt, grp_cb = await new_group(
            name="select_evaluation_strategy",
            inputs={
                "user_input": user_input,
                "expected_output": expected_output,
                "actual_output": actual_output,
            },
            callbacks=callbacks,
        )
        try:
            res = cast(
                EvaluationStrategySelection,
                await self.model.generate_structured_output(
                    prompt, schema=EvaluationStrategySelection, callbacks=grp_cb
                ),
            )
        except Exception as e:
            await run_mgt.on_chain_error(e)
            res = EvaluationStrategySelection(
                strategy=EvaluationStrategy.STRICT,
                reason="Strategy selection failed, defaulting to strict strategy",
            )

        await run_mgt.on_chain_end(
            outputs={"strategy": res.strategy, "reason": res.reason}
        )
        return res

    async def _a_evaluate_with_lenient_strategy(
        self,
        user_input: str,
        expected_output: str,
        actual_output: str,
        language: Language = Language.ENGLISH,
        callbacks: Optional[Callbacks] = None,
    ) -> LenientCorrectnessResult:
        assert self.model is not None, "llm is not set"
        prompt = self.evaluation_template.generate_lenient_correctness_evaluation(
            user_input=user_input,
            expected_output=expected_output,
            actual_output=actual_output,
            language=language,
        )
        run_mgt, grp_cb = await new_group(
            name="evaluate_lenient_correctness",
            inputs={
                "user_input": user_input,
                "expected_output": expected_output,
                "actual_output": actual_output,
            },
            callbacks=callbacks,
        )
        try:
            res = cast(
                LenientCorrectnessResult,
                await self.model.generate_structured_output(
                    prompt, schema=LenientCorrectnessResult, callbacks=grp_cb
                ),
            )
        except Exception as e:
            await run_mgt.on_chain_error(e)
            raise e

        await run_mgt.on_chain_end(outputs={"score": res.score, "reason": res.reason})
        return res

    async def _a_generate_statements(
        self,
        user_input: str,
        text: str,
        language: Language = Language.ENGLISH,
        callbacks: Optional[Callbacks] = None,
    ) -> List[str]:
        assert self.model is not None, "llm is not set"
        prompt = self.evaluation_template.generate_statements(
            user_input=user_input, text=text, language=language
        )
        run_mgt, grp_cb = await new_group(
            name="generate_statements",
            inputs={"user_input": user_input, "text": text},
            callbacks=callbacks,
        )
        try:
            res = cast(
                Statements,
                await self.model.generate_structured_output(
                    prompt, schema=Statements, callbacks=grp_cb
                ),
            )
            statements: List[str] = res.statements
        except Exception as e:
            await run_mgt.on_chain_error(e)
            raise e

        await run_mgt.on_chain_end(outputs={"statements": statements})
        return statements

    async def _a_generate_verdicts(
        self,
        user_input: str,
        actual_output_statements: List[str],
        expected_output_statements: List[str],
        language: Language = Language.ENGLISH,
        callbacks: Optional[Callbacks] = None,
    ) -> Verdicts:
        assert self.model is not None, "llm is not set"
        prompt = self.evaluation_template.generate_verdicts(
            user_input=user_input,
            actual_output_statements=actual_output_statements,
            expected_output_statements=expected_output_statements,
            language=language,
        )
        run_mgt, grp_cb = await new_group(
            name="generate_verdicts",
            inputs={
                "user_input": user_input,
                "actual_output_statements": actual_output_statements,
                "expected_output_statements": expected_output_statements,
            },
            callbacks=callbacks,
        )
        try:
            verdicts = await self.model.generate_structured_output(
                prompt, schema=Verdicts, callbacks=grp_cb
            )
        except Exception as e:
            await run_mgt.on_chain_error(e)
            raise e
        await run_mgt.on_chain_end(outputs={"verdicts": verdicts})
        return cast(Verdicts, verdicts)

    async def _a_generate_reason(
        self,
        score: float,
        verdicts: Optional[Verdicts],
        language: Language = Language.ENGLISH,
        callbacks: Optional[Callbacks] = None,
    ) -> str:
        assert self.model is not None, "llm is not set"
        tp_reasons: List[str] = [tp.reason for tp in verdicts.TP] if verdicts else []
        fp_reasons: List[str] = [fp.reason for fp in verdicts.FP] if verdicts else []
        fn_reasons: List[str] = [fn.reason for fn in verdicts.FN] if verdicts else []
        prompt = self.evaluation_template.generate_reasons(
            score=score,
            tp_reasons=tp_reasons,
            fp_reasons=fp_reasons,
            fn_reasons=fn_reasons,
            language=language,
        )
        run_mgt, grp_cb = await new_group(
            name="generate_reason",
            inputs={
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
        assert test_case.actual_output, "actual_output cannot be empty"
        assert test_case.expected_output, "expected_output cannot be empty"

        language = detect_language(test_case.user_input)

        strategy_selection = await self._a_select_evaluation_strategy(
            user_input=test_case.user_input,
            expected_output=test_case.expected_output,
            actual_output=test_case.actual_output,
            language=language,
            callbacks=callbacks,
        )
        strategy = strategy_selection.strategy
        strategy_reason = strategy_selection.reason

        if strategy == EvaluationStrategy.LENIENT:
            lenient_result = await self._a_evaluate_with_lenient_strategy(
                user_input=test_case.user_input,
                expected_output=test_case.expected_output,
                actual_output=test_case.actual_output,
                language=language,
                callbacks=callbacks,
            )
            score = lenient_result.score
            reason = lenient_result.reason if self.include_reason else None
            verdicts = None
            actual_output_statements = []
            expected_output_statements = []
        else:
            actual_output_statements = await self._a_generate_statements(
                user_input=test_case.user_input,
                text=test_case.actual_output,
                language=language,
                callbacks=callbacks,
            )
            expected_output_statements = await self._a_generate_statements(
                user_input=test_case.user_input,
                text=test_case.expected_output,
                language=language,
                callbacks=callbacks,
            )

            if actual_output_statements or expected_output_statements:
                verdicts = await self._a_generate_verdicts(
                    user_input=test_case.user_input,
                    actual_output_statements=actual_output_statements,
                    expected_output_statements=expected_output_statements,
                    language=language,
                    callbacks=callbacks,
                )
                f1_score = self._compute_statement_presence(verdicts)
            else:
                verdicts = None
                f1_score = 1.0

            if self.weights[1] == 0:
                similarity_score = 0.0
            else:
                if self.answer_similarity is None:
                    self.answer_similarity = AnswerSimilarity(
                        embedding_model=self.embedding_model
                    )
                similarity_value = await self.answer_similarity.compute(
                    test_case=test_case, callbacks=callbacks
                )
                similarity_score = similarity_value.score

            try:
                import numpy as np
            except ImportError:
                raise ImportError(
                    "This function requires 'numpy'. Install it with: pip install numpy"
                )
            arr = np.array([f1_score, similarity_score], dtype=float)
            score = float(np.average(arr, weights=self.weights))

            reason = None
            if self.include_reason:
                reason = await self._a_generate_reason(
                    f1_score,
                    verdicts,
                    language=language,
                    callbacks=callbacks,
                )

        metric_value = MetricValue(
            score=score,
            reason=reason,
            run_logs={
                "evaluation_strategy": strategy.value,
                "strategy_reason": strategy_reason,
                "actual_output_statements": actual_output_statements,
                "expected_output_statements": expected_output_statements,
                "verdicts": verdicts,
            },
        )

        return metric_value
