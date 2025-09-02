import unittest
import pytest
from unittest.mock import patch, AsyncMock

from diting_core.metrics.faithfulness.faithfulness import Faithfulness
from diting_core.metrics.faithfulness.schema import (
    Verdicts,
    Statements,
    FaithfulnessVerdict,
)
from diting_core.metrics.base_metric import MetricValue
from diting_core.cases.llm_case import LLMCase
from mock_model import MockLLM


class TestFaithfulness(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.model_mock = MockLLM()
        self.faithfulness = Faithfulness(model=self.model_mock)
        self.test_case = LLMCase(
            user_input="What is the capital of France?",
            actual_output="The capital of France is Paris.",
            retrieval_context=[
                "Paris is the capital of France.",
                "France's capital city is Paris.",
            ],
        )

    @staticmethod
    def create_mock_verdicts() -> Verdicts:
        verdicts_list = [
            FaithfulnessVerdict(
                statement="Paris is the capital of France.",
                reason="This is a factual statement widely accepted.",
                verdict=1,
            ),
            FaithfulnessVerdict(
                statement="The capital of France is not Berlin.",
                reason="Berlin is the capital of Germany, not France.",
                verdict=1,
            ),
            FaithfulnessVerdict(
                statement="The capital of Italy is Rome.",
                reason="This is another factual statement that is well-known.",
                verdict=1,
            ),
            FaithfulnessVerdict(
                statement="Paris is the capital of Italy.",
                reason="This is incorrect; the capital of Italy is Rome.",
                verdict=0,
            ),
            FaithfulnessVerdict(
                statement="London is the capital of France.",
                reason="This is an incorrect statement; London is the capital of the UK.",
                verdict=0,
            ),
        ]

        return Verdicts(verdicts=verdicts_list)

    def test_compute_score(self):
        verdicts = self.create_mock_verdicts()
        score = Faithfulness._compute_score(verdicts)
        self.assertEqual(score, 0.6)

    def test_compute_score_empty(self):
        verdicts = Verdicts(verdicts=[])
        score = Faithfulness._compute_score(verdicts)
        import numpy as np

        self.assertTrue(np.isnan(score))

    async def test__a_generate_statements(self):
        with patch.object(
            self.model_mock,
            "generate_structured_output",
            AsyncMock(return_value=Statements(statements=["statement1"])),
        ):
            statements = await self.faithfulness._a_generate_statements(
                "What is the capital?", "The capital is Paris."
            )
            self.assertEqual(statements, ["statement1"])

    async def test__a_generate_statements_exception(self):
        with patch.object(
            self.model_mock,
            "generate_structured_output",
            AsyncMock(side_effect=Exception("Mocked exception")),
        ):
            with pytest.raises(Exception, match="Mocked exception"):
                await self.faithfulness._a_generate_statements(
                    user_input="test input", text="text input"
                )

    async def test__a_generate_verdicts(self):
        verdicts = self.create_mock_verdicts()
        with patch.object(
            self.model_mock,
            "generate_structured_output",
            AsyncMock(return_value=verdicts),
        ):
            res = await self.faithfulness._a_generate_verdicts(
                ["context"], ["statements"]
            )
            self.assertEqual(verdicts, res)

    async def test__a_generate_verdicts_exception(self):
        with patch.object(
            self.model_mock,
            "generate_structured_output",
            AsyncMock(side_effect=Exception("Mocked exception")),
        ):
            with pytest.raises(Exception, match="Mocked exception"):
                await self.faithfulness._a_generate_verdicts(
                    ["context"], ["statements"]
                )

    async def test__compute_statements_is_empty(self):
        with patch.object(
            Faithfulness,
            "_a_generate_statements",
            AsyncMock(return_value=[]),
        ):
            metric_value = await self.faithfulness._compute(self.test_case)
            import numpy as np

            self.assertTrue(np.isnan(metric_value.score))

    async def test__compute(self):
        with (
            patch.object(
                Faithfulness, "_a_generate_statements", new_callable=AsyncMock
            ) as mock_statements,
            patch.object(
                Faithfulness, "_a_generate_verdicts", new_callable=AsyncMock
            ) as mock_verdicts,
            patch.object(
                Faithfulness, "_a_generate_reason", new_callable=AsyncMock
            ) as mock_reason,
        ):
            mock_statements.return_value = ["statements"]
            mock_verdicts.return_value = self.create_mock_verdicts()
            mock_reason.return_value = "test"
            metric_value = await self.faithfulness._compute(self.test_case)
            self.assertIsInstance(metric_value, MetricValue)
