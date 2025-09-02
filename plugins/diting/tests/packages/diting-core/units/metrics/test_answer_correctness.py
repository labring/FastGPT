import unittest
import pytest
from unittest.mock import patch, AsyncMock

from diting_core.metrics.answer_correctness.answer_correctness import AnswerCorrectness
from diting_core.metrics.answer_correctness.schema import (
    Verdicts,
    StatementsWithReason,
    Statements,
    Reason,
)
from diting_core.metrics.base_metric import MetricValue
from diting_core.cases.llm_case import LLMCase
from mock_model import MockLLM
from mock_embedding import MockEmbeddings


class TestAnswerCorrectness(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.model_mock = MockLLM()
        # self.answer_similarity = AnswerSimilarity(embedding_model=MockEmbeddings())
        self.mock_embedding = MockEmbeddings()
        self.answer_correctness = AnswerCorrectness(
            model=self.model_mock, embedding_model=self.mock_embedding
        )
        self.test_case = LLMCase(
            user_input="法国的首都是什么？",
            actual_output="法国的首都为巴黎。",
            expected_output="巴黎是法国的首都。",
        )

    def test_initialization_valid(self):
        self.assertEqual(len(self.answer_correctness.weights), 2)
        self.assertTrue(all(w >= 0 for w in self.answer_correctness.weights))

    # Invalid count
    def test_initialization_invalid_weights_count(self):
        with self.assertRaises(ValueError):
            AnswerCorrectness(model=self.model_mock, weights=[0.5, 0.3, 0.2])

    # All weights zero
    def test_initialization_invalid_weights_sum_zero(self):
        with self.assertRaises(ValueError):
            AnswerCorrectness(model=self.model_mock, weights=[0, 0])

    # Negative weight
    def test_initialization_invalid_weights_negative(self):
        with self.assertRaises(ValueError):
            AnswerCorrectness(model=self.model_mock, weights=[-0.2, 0.2])

    # Invalid beta type
    def test_initialize_invalid_beta(self):
        with self.assertRaises(ValueError):
            AnswerCorrectness(model=self.model_mock, beta="string")  # type: ignore

    # Function to create mock verdicts
    @staticmethod
    def create_mock_verdicts() -> Verdicts:
        # Creating True Positive examples (TP)
        tp_statements = [
            StatementsWithReason(
                statement="Paris is the capital of France.",
                reason="This is a factually correct statement widely accepted.",
            ),
            StatementsWithReason(
                statement="The capital of France is located in Europe.",
                reason="This information is common geographical knowledge.",
            ),
        ]

        # Creating False Positive examples (FP)
        fp_statements = [
            StatementsWithReason(
                statement="The capital of France is not Madrid.",
                reason="This is a misleading statement because Madrid is the capital of Spain.",
            ),
            StatementsWithReason(
                statement="The capital of France is Germany.",
                reason="This is incorrect as Germany is not the capital of France.",
            ),
        ]

        # Creating False Negative examples (FN)
        fn_statements = [
            StatementsWithReason(
                statement="Paris is the capital of Italy.",
                reason="This is a false statement as the capital of Italy is Rome.",
            ),
            StatementsWithReason(
                statement="The capital of France is Brussels.",
                reason="This is incorrect; Brussels is the capital of Belgium, not France.",
            ),
        ]

        # Creating a Verdicts instance
        verdicts = Verdicts(TP=tp_statements, FP=fp_statements, FN=fn_statements)
        return verdicts

    async def test__compute_statement_presence(self):
        verdicts = self.create_mock_verdicts()
        score = self.answer_correctness._compute_statement_presence(verdicts)
        self.assertTrue(
            0 <= score <= 1
        )  # Assuming fbeta_score returns a score between 0 and 1

    async def test__a_generate_statements(self):
        with patch.object(
            self.model_mock,
            "generate_structured_output",
            AsyncMock(return_value=Statements(statements=["statement1"])),
        ):
            statements = await self.answer_correctness._a_generate_statements(
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
                await self.answer_correctness._a_generate_statements(
                    user_input="test input", text="text input"
                )

    async def test__a_generate_verdicts(self):
        verdicts = self.create_mock_verdicts()
        with patch.object(
            self.model_mock,
            "generate_structured_output",
            AsyncMock(return_value=verdicts),
        ):
            res = await self.answer_correctness._a_generate_verdicts(
                "What is the capital?", ["statement1"], ["statement2"]
            )
            self.assertEqual(verdicts, res)

    async def test__a_generate_verdicts_exception(self):
        with patch.object(
            self.model_mock,
            "generate_structured_output",
            AsyncMock(side_effect=Exception("Mocked exception")),
        ):
            with pytest.raises(Exception, match="Mocked exception"):
                await self.answer_correctness._a_generate_verdicts(
                    "What is the capital?", ["statement1"], ["statement2"]
                )

    async def test__a_generate_reason(self):
        verdicts = self.create_mock_verdicts()
        with patch.object(
            self.model_mock,
            "generate_structured_output",
            AsyncMock(return_value=Reason(reason="test")),
        ):
            res = await self.answer_correctness._a_generate_reason(
                score=1.0, verdicts=verdicts
            )
            self.assertEqual(res, "test")

    async def test__a_generate_reason_exception(self):
        verdicts = self.create_mock_verdicts()
        with patch.object(
            self.model_mock,
            "generate_structured_output",
            AsyncMock(side_effect=Exception("Mocked exception")),
        ):
            with pytest.raises(Exception, match="Mocked exception"):
                await self.answer_correctness._a_generate_reason(
                    score=1.0, verdicts=verdicts
                )

    async def test__compute(self):
        self.answer_correctness.include_reason = False
        with (
            patch.object(
                AnswerCorrectness, "_a_generate_statements", new_callable=AsyncMock
            ) as mock_statements,
            patch.object(
                AnswerCorrectness, "_a_generate_verdicts", new_callable=AsyncMock
            ) as mock_verdicts,
        ):
            mock_statements.side_effect = [
                ["statement1"],  # For actual
                ["statement2"],  # For expected
            ]
            mock_verdicts.return_value = self.create_mock_verdicts()
            metric_value = await self.answer_correctness._compute(self.test_case)
            self.assertIsInstance(metric_value, MetricValue)

    async def test__compute_with_reathon(self):
        self.answer_correctness.include_reason = True
        with (
            patch.object(
                AnswerCorrectness, "_a_generate_statements", new_callable=AsyncMock
            ) as mock_statements,
            patch.object(
                AnswerCorrectness, "_a_generate_verdicts", new_callable=AsyncMock
            ) as mock_verdicts,
            patch.object(
                AnswerCorrectness, "_a_generate_reason", new_callable=AsyncMock
            ) as mock_reason,
        ):
            mock_statements.side_effect = [
                ["statement1"],  # For actual
                ["statement2"],  # For expected
            ]
            mock_verdicts.return_value = self.create_mock_verdicts()
            mock_reason.return_value = "test"
            metric_value = await self.answer_correctness._compute(self.test_case)
            self.assertIsInstance(metric_value, MetricValue)
