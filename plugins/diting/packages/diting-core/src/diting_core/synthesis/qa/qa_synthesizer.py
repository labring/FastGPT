# !/usr/bin/env python3
# -*- coding: utf-8 -*-
import asyncio
from dataclasses import field, dataclass
from typing import Any, Type, List, Optional

from diting_core.callbacks.base import Callbacks
from diting_core.cases.llm_case import LLMCaseParams, LLMCase
from diting_core.metrics.qa_quality.qa_quality import QAQuality
from diting_core.models.llms.base_model import BaseLLM
from diting_core.utilities.executor import task_wrapper
from diting_core.synthesis.base_synthesizer import BaseSynthesizer
from diting_core.synthesis.base_corpus import BaseCorpus
from diting_core.synthesis.qa.schema import QAPairs, QAWithScore, QA
from diting_core.synthesis.qa.template import QAGenerateTemplate


@dataclass
class QASynthesizer(BaseSynthesizer):
    """
    The QASynthesizer uses LLM-as-a-generator to generate
    high quality of synthetic data.
    Attributes:
        model (BaseLLM): The language model used for generating data.
        required_input_fields (List[str]): The list of input fields required for the Synthesizer.
        required_output_fields (List[str]): The list of output fields expected from the Synthesizer.
        generate_template (Type[QAGenerateTemplate]): The template used to build prompts for generation.
        max_generation_per_context (int): The maximum number of generations allowed per context.
        max_concurrency (int): The maximum number of concurrent generation tasks.
        quality_threshold (float): The minimum quality score required for generated data.
        max_quality_retries (int): The maximum number of retries for generating high-quality data.
    """

    model: Optional[BaseLLM] = None
    required_input_fields: List[str] = field(
        default_factory=lambda: [
            LLMCaseParams.CONTEXT.value,
        ]
    )

    required_output_fields: List[str] = field(
        default_factory=lambda: [
            LLMCaseParams.USER_INPUT.value,
            LLMCaseParams.EXPECTED_OUTPUT.value,
            LLMCaseParams.CONTEXT.value,
        ]
    )

    generate_template: Type[QAGenerateTemplate] = QAGenerateTemplate

    max_generation_per_context = 3
    max_concurrency: int = 10

    quality_threshold: float = 0.7
    max_quality_retries: int = 3

    _metric: Optional[QAQuality] = None

    @property
    def metric(self):
        if self._metric is None:
            self._metric = QAQuality(model=self.model)
        return self._metric

    async def _apply(
        self,
        corpus: BaseCorpus,
        callbacks: Optional[Callbacks] = None,
        **kwargs: Any,
    ) -> LLMCase:
        """Applies the QAGenerateSynthesizer to the provided input data.

        This method generates QA pairs based on the input context, evaluates their quality,
        and returns the best QA pair based on the quality score.

        Args:
            corpus (BaseCorpus): The input data for the synthesizer, which must contain
                the required fields specified in `required_input_fields`.
            callbacks (Optional[Callbacks]): Optional callbacks to be executed during the Synthesizer application.

        Returns:
            LLMCase: The output data containing the best QA pair and its quality score.

        Raises:
            Exception: If there is an error during the generation or quality evaluation.
        """
        # Generate QAPair
        assert self.model is not None, "llm is not set"
        assert corpus.context, "context cannot be empty"

        context = corpus.context
        prompt = self.generate_template.generate_qa(
            context, self.max_generation_per_context
        )
        qa_pairs = await self.model.generate_structured_output(
            prompt, schema=QAPairs, callbacks=callbacks
        )
        qa_pairs = QAPairs.model_validate(qa_pairs).qa_pairs

        # measure the generated QA quality
        best_candidate: QAWithScore = await self.chose_with_threshold(
            context, qa_pairs, callbacks=callbacks
        )
        llm_case = LLMCase(
            user_input=best_candidate.QA.question,
            expected_output=best_candidate.QA.answer,
            context=context,
            metadata={
                "synthesizer": self.name,
                "score": best_candidate.score,
                "reason": best_candidate.reason,
            },
        )

        return llm_case

    async def _compute_quality(
        self,
        qa: QA,
        context: Optional[List[str]],
        scores: List[QAWithScore],
        callbacks: Optional[Callbacks] = None,
    ) -> None:
        """Computes the quality score for a given QA pair.

        This method evaluates the QA pair using the QAQuality and appends the result
        to the provided scores list.

        Args:
            qa (QA): The QA pair to evaluate.
            context (Optional[List[str]]): The context associated with the QA pair.
            scores (List[QAWithScore]): The list to store the quality scores of evaluated QA pairs.
        """
        case = LLMCase(
            user_input=qa.question,
            expected_output=qa.answer,
            context=context,
        )
        metric_value = await self.metric.compute(case, callbacks=callbacks)
        scores.append(
            QAWithScore(
                QA=qa, score=metric_value.score or 0, reason=metric_value.reason or ""
            )
        )

    async def chose_with_threshold(
        self,
        context: List[str],
        qa_pairs: List[QA],
        callbacks: Optional[Callbacks] = None,
    ) -> QAWithScore:
        assert self.model is not None, "llm is not set"
        best_candidate = QAWithScore(QA=QA(question="", answer=""), score=0, reason="")
        for _ in range(self.max_quality_retries):
            semaphore = asyncio.Semaphore(self.max_concurrency)
            scores: List[QAWithScore] = []
            tasks = [
                task_wrapper(
                    semaphore,
                    self._compute_quality,
                    qa=qa,
                    context=context,
                    scores=scores,
                    callbacks=callbacks,
                )
                for qa in qa_pairs
            ]
            await asyncio.gather(*tasks)

            # vote by the best score
            if len(scores) == 0:
                # retry generate and measure
                prompt = self.generate_template.generate_qa(
                    context, self.max_generation_per_context
                )
                qa_pair_res = await self.model.generate_structured_output(
                    prompt, schema=QAPairs, callbacks=callbacks
                )
                qa_pairs = QAPairs.model_validate(qa_pair_res).qa_pairs
                continue

            best_candidate = max(scores, key=lambda x: x.score)
            if best_candidate.score < self.quality_threshold:
                # rewrite the generations with reason
                rewrite_prompt = self.generate_template.rewrite_qa(
                    context,
                    best_candidate.QA.question,
                    best_candidate.QA.answer,
                    best_candidate.reason,
                )
                rewritten_qa_pairs = await self.model.generate_structured_output(
                    rewrite_prompt, schema=QAPairs, callbacks=callbacks
                )
                rewritten_qa_pairs = QAPairs.model_validate(rewritten_qa_pairs).qa_pairs
                qa_pairs = rewritten_qa_pairs
            else:
                return best_candidate

        return best_candidate
