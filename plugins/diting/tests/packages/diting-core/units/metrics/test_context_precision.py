import unittest
import pytest
from unittest.mock import AsyncMock, patch
from diting_core.metrics.context_precision.context_precision import ContextPrecision
from diting_core.metrics.context_precision.schema import Verdict, Reason
from diting_core.metrics.base_metric import MetricValue
from diting_core.cases.llm_case import LLMCase
from mock_model import MockLLM


class TestContextPrecision(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.model_mock = MockLLM()
        self.metric = ContextPrecision(model=self.model_mock)
        self.test_case = LLMCase(
            user_input="Test user input",
            expected_output="Expected result",
            retrieval_context=["Context 1", "Context 2"],
        )

    def test_calculate_average_precision(self):
        # Test case with verdicts
        verdicts = [
            Verdict(reason=" ", verdict=1),
            Verdict(reason=" ", verdict=1),
        ]
        precision_score = self.metric._calculate_average_precision(verdicts)
        self.assertAlmostEqual(precision_score, 1, places=2)

    async def test_a_generate_verdicts_success(self):
        with patch.object(
            self.model_mock,
            "generate_structured_output",
            AsyncMock(return_value=Verdict(reason=" ", verdict=True)),
        ):
            user_input = "Test user input"
            expected_output = "Expected result"
            context = "Sample context"

            verdict = await self.metric._a_generate_verdicts(
                user_input, expected_output, context
            )
            self.assertIsInstance(verdict, Verdict)
            self.assertTrue(verdict.verdict)

    async def test_a_generate_verdicts_error(self):
        with patch.object(
            self.model_mock,
            "generate_structured_output",
            AsyncMock(side_effect=Exception("Mocked exception")),
        ):
            with pytest.raises(Exception, match="Mocked exception"):
                await self.metric._a_generate_verdicts("input", "output", "context")

    async def test_compute(self):
        with patch.object(
            self.model_mock,
            "generate_structured_output",
            AsyncMock(
                side_effect=[
                    Verdict(reason=" ", verdict=True),
                    Verdict(reason=" ", verdict=False),
                ]
            ),
        ):
            with patch.object(
                self.metric,
                "_a_generate_reason",
                AsyncMock(return_value=Reason(reason="test")),
            ):
                metric_value = await self.metric._compute(self.test_case)
                self.assertIsInstance(metric_value, MetricValue)


if __name__ == "__main__":
    unittest.main()
