import typing as t
import unittest
from unittest.mock import patch

from diting_core.metrics.base_metric import BaseMetric, MetricValue
from diting_core.synthesis.base_corpus import BaseCorpus
from diting_core.synthesis import QASynthesizer
from diting_core.models.llms.base_model import BaseLLM
from diting_core.synthesis.qa.schema import QA, QAWithScore
from diting_core.cases.llm_case import LLMCaseParams, LLMCase


class MockLLM(BaseLLM):
    async def generate(self, *args: t.Any, **kwargs: t.Dict[str, t.Any]) -> str:
        return "mock"

    async def generate_structured_output(self, prompt, schema=None, callbacks=None):
        return {
            "qa_pairs": [
                {
                    "question": "What is AI?",
                    "answer": "Artificial Intelligence",
                },
                {
                    "question": "Define AI.",
                    "answer": "AI is the simulation of human intelligence.",
                },
            ]
        }


class MockQAQualityMetric(BaseMetric):
    async def _compute(
        self, test_case: LLMCase, *args: t.Any, **kwargs: t.Any
    ) -> MetricValue:
        if test_case.user_input == "What is AI?":
            return MetricValue(score=0.8, reason="test low")
        return MetricValue(score=0.9, reason="test hight")


class TestQASynthesizer(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mock_model = MockLLM()
        self.rule = QASynthesizer(model=self.mock_model)
        self.rule._metric = MockQAQualityMetric()  # Mock the QAQuality

    async def test_apply_success(self):
        """测试正常情况下的_apply方法"""
        rule_input = BaseCorpus.model_validate(
            {LLMCaseParams.CONTEXT.value: ["Explain AI."]}
        )
        result = await self.rule._apply(rule_input)
        self.assertIn("score", result.metadata)
        self.assertIn("reason", result.metadata)
        self.assertEqual(result.user_input, "Define AI.")
        self.assertEqual(
            result.expected_output, "AI is the simulation of human intelligence."
        )

    async def test_apply_no_qa_pairs(self):
        """测试生成的QA对为空的情况"""
        with patch.object(
            self.mock_model, "generate_structured_output", return_value={"qa_pairs": []}
        ):
            rule_input = BaseCorpus.model_validate(
                {LLMCaseParams.CONTEXT.value: ["Explain AI."]}
            )
            result = await self.rule._apply(rule_input)
            self.assertEqual(result.metadata["score"], 0)
            self.assertEqual(result.metadata["reason"], "")

    async def test_chose_with_threshold_success(self):
        """测试选择符合质量阈值的QA对"""
        qa_pairs = [QA(question="What is AI?", answer="Artificial Intelligence")]
        context = ["Explain AI."]
        result = await self.rule.chose_with_threshold(context, qa_pairs)
        self.assertIsInstance(result, QAWithScore)

    async def test_chose_with_threshold_retry(self):
        """测试选择QA对时的重试逻辑"""
        qa_pairs = [QA(question="What is AI?", answer="Artificial Intelligence")]
        context = ["Explain AI."]
        with patch.object(self.rule, "quality_threshold", 1.1):
            result = await self.rule.chose_with_threshold(context, qa_pairs)
            self.assertIsInstance(result, QAWithScore)

    async def test_compute_quality(self):
        """测试计算QA对的质量"""
        qa = QA(question="What is AI?", answer="Artificial Intelligence")
        scores = []
        await self.rule._compute_quality(qa, ["Explain AI."], scores)
        self.assertEqual(len(scores), 1)

    async def test_apply_missing_context(self):
        """测试缺少上下文时的异常处理"""
        with self.assertRaises(AssertionError):
            await self.rule._apply(BaseCorpus())


if __name__ == "__main__":
    unittest.main()
