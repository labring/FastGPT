#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from dataclasses import field, dataclass
from typing import Optional, Any, List
from diting_core.callbacks.base import Callbacks
from diting_core.cases.llm_case import LLMCase, LLMCaseParams
from diting_core.metrics.base_metric import BaseMetric, MetricValue
from diting_core.models.embeddings.base_model import BaseEmbeddings


@dataclass
class AnswerSimilarity(BaseMetric):
    embedding_model: Optional[BaseEmbeddings] = None
    _required_params: List[LLMCaseParams] = field(
        default_factory=lambda: [
            LLMCaseParams.ACTUAL_OUTPUT,
            LLMCaseParams.EXPECTED_OUTPUT,
        ]
    )

    async def _compute(
        self,
        test_case: LLMCase,
        *args: Any,
        callbacks: Optional[Callbacks] = None,
        **kwargs: Any,
    ) -> MetricValue:
        assert self.embedding_model is not None, "embeddings is not set"
        assert test_case.actual_output
        assert test_case.expected_output
        try:
            import numpy as np
        except ImportError:
            raise ImportError(
                "This function requires 'numpy'. Install it with: pip install numpy"
            )

        embedding_1 = np.array(
            await self.embedding_model.embed_text(
                test_case.actual_output, callbacks=callbacks
            )
        )
        embedding_2 = np.array(
            await self.embedding_model.embed_text(
                test_case.expected_output, callbacks=callbacks
            )
        )
        # Normalization factors of the above embeddings
        norms_1 = np.linalg.norm(embedding_1, keepdims=True)
        norms_2 = np.linalg.norm(embedding_2, keepdims=True)
        embedding_1_normalized = embedding_1 / norms_1
        embedding_2_normalized = embedding_2 / norms_2
        similarity = embedding_1_normalized @ embedding_2_normalized.T

        assert isinstance(similarity, np.floating), "Expects np.floating"
        score = float(similarity)

        return MetricValue(
            score=score,
            reason=f"The cosine similarity score between the question and the answer is {score:.4f}",
        )
