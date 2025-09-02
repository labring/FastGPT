import unittest
from unittest.mock import AsyncMock, patch
from diting_core.cases.llm_case import LLMCase
from diting_core.metrics.answer_correctness.answer_correctness import AnswerCorrectness
from diting_core.metrics.context_recall.context_recall import ContextRecall
from diting_core.metrics.faithfulness.faithfulness import Faithfulness
from diting_core.metrics.rag_runtime.rag_runtime import RagRuntime
from diting_core.metrics.base_metric import MetricValue
from diting_core.metrics.rag_runtime.schema import EvaluationResult, Verdicts


class TestRagRuntime(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mocked_llm = AsyncMock()
        self.mocked_embedding_model = AsyncMock()
        self.rag_runtime = RagRuntime(
            embedding_model=self.mocked_embedding_model,
            model=self.mocked_llm,
        )
        self.test_case = LLMCase(
            user_input="法国的首都是什么？",
            actual_output="法国的首都为巴黎。",
            expected_output="巴黎是法国的首都。",
            retrieval_context=["关于法国的背景信息。"],
        )

    async def test__evaluate_answer_correctness(self):
        with patch.object(
            AnswerCorrectness, "compute", AsyncMock(return_value=MetricValue(score=1.0))
        ):
            result = await self.rag_runtime._evaluate_answer_correctness(self.test_case)
            self.assertEqual(result, MetricValue(score=1.0))

    async def test__evaluate_context_recall(self):
        with patch.object(
            ContextRecall, "compute", AsyncMock(return_value=MetricValue(score=1.0))
        ):
            result = await self.rag_runtime._evaluate_context_recall(self.test_case)
            self.assertEqual(result, MetricValue(score=1.0))

    async def test__evaluate_faithfulness(self):
        with patch.object(
            Faithfulness, "compute", AsyncMock(return_value=MetricValue(score=1.0))
        ):
            result = await self.rag_runtime._evaluate_faithfulness(self.test_case)
            self.assertEqual(result, MetricValue(score=1.0))

    async def test_evaluate_correct_answer(self):
        self.rag_runtime._evaluate_answer_correctness = AsyncMock(
            return_value=MetricValue(score=0.95)
        )
        result = await self.rag_runtime.compute(self.test_case)
        self.assertEqual(result.run_logs["result"], EvaluationResult.ACCURACY)

    async def test_evaluate_high_context_recall(self):
        self.rag_runtime._evaluate_answer_correctness = AsyncMock(
            return_value=MetricValue(score=0.7)
        )
        self.rag_runtime._evaluate_context_recall = AsyncMock(
            return_value=MetricValue(score=0.95)
        )
        self.rag_runtime.model.generate_structured_output = AsyncMock(
            return_value=Verdicts(result=EvaluationResult.ACCURACY, reason="accuracy")
        )
        result = await self.rag_runtime.compute(self.test_case)
        self.assertEqual(result.run_logs["result"], EvaluationResult.ACCURACY)
        self.assertEqual(result.run_logs["reason"], "accuracy")

    async def test_evaluate_high_faithfulness_with_high_recall(self):
        self.rag_runtime._evaluate_answer_correctness = AsyncMock(
            return_value=MetricValue(score=0.7)
        )
        self.rag_runtime._evaluate_context_recall = AsyncMock(
            return_value=MetricValue(score=0.95)
        )
        self.rag_runtime._evaluate_faithfulness = AsyncMock(
            return_value=MetricValue(score=0.95)
        )
        self.rag_runtime.model.generate_structured_output = AsyncMock(
            return_value=Verdicts(result="Retrieval_Context_Noise", reason="test")
        )
        result = await self.rag_runtime.compute(self.test_case)
        self.assertEqual(
            result.run_logs["result"], EvaluationResult.RETRIEVAL_CONTEXT_NOISE
        )

    async def test_evaluate_high_faithfulness_with_high_recall_no_reason(self):
        self.rag_runtime._evaluate_answer_correctness = AsyncMock(
            return_value=MetricValue(score=0.7)
        )
        self.rag_runtime._evaluate_context_recall = AsyncMock(
            return_value=MetricValue(score=0.95)
        )
        self.rag_runtime._evaluate_faithfulness = AsyncMock(
            return_value=MetricValue(score=0.95)
        )
        self.rag_runtime.model.generate_structured_output = AsyncMock(
            return_value=Verdicts(result="", reason="test")
        )
        result = await self.rag_runtime.compute(self.test_case)
        self.assertEqual(
            result.run_logs["result"], EvaluationResult.RETRIEVAL_CONTEXT_NOISE
        )
        self.assertEqual(result.run_logs["reason"], EvaluationResult.UNKNOWN)

    async def test_evaluate_low_faithfulness_with_high_recall(self):
        self.rag_runtime._evaluate_answer_correctness = AsyncMock(
            return_value=MetricValue(score=0.7)
        )
        self.rag_runtime._evaluate_context_recall = AsyncMock(
            return_value=MetricValue(score=0.95)
        )
        self.rag_runtime._evaluate_faithfulness = AsyncMock(
            return_value=MetricValue(score=0.5)
        )
        self.rag_runtime.model.generate_structured_output = AsyncMock(
            return_value=Verdicts(result="Fabricate_Output", reason="test")
        )
        result = await self.rag_runtime.compute(self.test_case)
        self.assertEqual(result.run_logs["result"], EvaluationResult.FABRICATE_OUTPUT)

    async def test_evaluate_incomplete_retrieval_context(self):
        self.rag_runtime._evaluate_answer_correctness = AsyncMock(
            return_value=MetricValue(score=0.4)
        )
        self.rag_runtime._evaluate_context_recall = AsyncMock(
            return_value=MetricValue(score=0.4)
        )
        self.rag_runtime.model.generate_structured_output = AsyncMock(
            return_value=Verdicts(result="Accuracy", reason="test")
        )
        result = await self.rag_runtime.compute(self.test_case)
        self.assertEqual(result.run_logs["result"], EvaluationResult.ACCURACY)

    async def test_evaluate_incomplete_retrieval_context_no_reason(self):
        self.rag_runtime._evaluate_answer_correctness = AsyncMock(
            return_value=MetricValue(score=0.4)
        )
        self.rag_runtime._evaluate_context_recall = AsyncMock(
            return_value=MetricValue(score=0.4)
        )
        self.rag_runtime.model.generate_structured_output = AsyncMock(
            return_value=Verdicts(result="", reason="test")
        )
        result = await self.rag_runtime.compute(self.test_case)
        self.assertEqual(
            result.run_logs["result"], EvaluationResult.INCOMPLETE_RETRIEVAL_CONTEXT
        )
        self.assertEqual(result.run_logs["reason"], EvaluationResult.UNKNOWN)

    async def test_evaluate_retrieval_context_noise(self):
        self.rag_runtime._evaluate_answer_correctness = AsyncMock(
            return_value=MetricValue(score=0.6)
        )
        self.rag_runtime._evaluate_context_recall = AsyncMock(
            return_value=MetricValue(score=0.9)
        )
        self.rag_runtime._evaluate_faithfulness = AsyncMock(
            return_value=MetricValue(score=0.95)
        )
        self.rag_runtime.model.generate_structured_output = AsyncMock(
            return_value=Verdicts(result="Retrieval_Context_Noise", reason="检测到噪声")
        )
        result = await self.rag_runtime.compute(self.test_case)

        self.assertEqual(result.run_logs["result"], "Retrieval_Context_Noise")
        self.assertEqual(result.run_logs["reason"], "检测到噪声")
