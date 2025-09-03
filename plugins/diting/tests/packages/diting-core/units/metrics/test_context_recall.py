import unittest
import pytest
from unittest.mock import patch, AsyncMock

from diting_core.metrics.context_recall.context_recall import ContextRecall
from diting_core.metrics.context_recall.schema import (
    Verdicts,
    ContextRecallVerdict,
    Reason,
)
from diting_core.metrics.base_metric import MetricValue
from diting_core.cases.llm_case import LLMCase
from mock_model import MockLLM


class TestContextRecall(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.model_mock = MockLLM()
        self.context_recall = ContextRecall(model=self.model_mock)
        self.test_case = LLMCase(
            user_input="What is the capital of France?",
            expected_output="The capital of France is Paris.",
            retrieval_context=[
                "Paris is the capital of France.",
                "France's capital city is Paris.",
            ],
        )

    @staticmethod
    def create_mock_verdicts() -> Verdicts:
        # Creating mock ContextRecallVerdict instances
        verdicts_list = [
            ContextRecallVerdict(
                statement="Paris is the capital of France.",
                reason="This is a factual statement widely accepted.",
                attributed=1,
            ),
            ContextRecallVerdict(
                statement="The capital of France is not Berlin.",
                reason="Berlin is the capital of Germany, not France.",
                attributed=1,
            ),
            ContextRecallVerdict(
                statement="The capital of Italy is Rome.",
                reason="This is another factual statement that is well-known.",
                attributed=1,
            ),
            ContextRecallVerdict(
                statement="Paris is the capital of Italy.",
                reason="This is incorrect; the capital of Italy is Rome.",
                attributed=0,
            ),
            ContextRecallVerdict(
                statement="London is the capital of France.",
                reason="This is an incorrect statement; London is the capital of the UK.",
                attributed=0,
            ),
        ]

        # Create Verdicts instance
        mock_verdicts = Verdicts(verdicts=verdicts_list)

        return mock_verdicts

    async def test__compute_score(self):
        verdicts = self.create_mock_verdicts()
        score = self.context_recall._compute_score(verdicts)
        self.assertEqual(score, 0.6)  # There are 3 positives out of 5 total

    async def test__a_generate_verdicts(self):
        verdicts = self.create_mock_verdicts()
        with patch.object(
            self.model_mock,
            "generate_structured_output",
            AsyncMock(return_value=verdicts),
        ):
            assert self.test_case.user_input, "user_input cannot be empty"
            assert self.test_case.expected_output, "expected_output cannot be empty"
            assert self.test_case.retrieval_context, "retrieval_context cannot be empty"
            res = await self.context_recall._a_generate_verdicts(
                user_input=self.test_case.user_input,
                expected_output=self.test_case.expected_output,
                retrieval_context=self.test_case.retrieval_context,
            )
            self.assertEqual(verdicts, res)
            self.assertEqual(len(verdicts.verdicts), 5)

    async def test__a_generate_verdicts_exception(self):
        assert self.test_case.user_input, "user_input cannot be empty"
        assert self.test_case.expected_output, "expected_output cannot be empty"
        assert self.test_case.retrieval_context, "retrieval_context cannot be empty"
        with patch.object(
            self.model_mock,
            "generate_structured_output",
            AsyncMock(side_effect=Exception("Mocked exception")),
        ):
            with pytest.raises(Exception, match="Mocked exception"):
                await self.context_recall._a_generate_verdicts(
                    user_input=self.test_case.user_input,
                    expected_output=self.test_case.expected_output,
                    retrieval_context=self.test_case.retrieval_context,
                )

    async def test__compute(self):
        verdicts = self.create_mock_verdicts()
        with patch.object(
            ContextRecall, "_a_generate_verdicts", AsyncMock(return_value=verdicts)
        ):
            with patch.object(
                self.context_recall,
                "_a_generate_reason",
                AsyncMock(return_value=Reason(reason="test")),
            ):
                metric_value = await self.context_recall._compute(self.test_case)
                self.assertIsInstance(metric_value, MetricValue)
