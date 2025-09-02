import typing as t
import unittest

from diting_core.cases.llm_case import LLMCase
from diting_core.metrics.qa_quality.qa_quality import QAQuality
from diting_core.metrics.qa_quality.schema import QAQualityFeedback
from diting_core.models.llms.base_model import BaseLLM


class MockLLM(BaseLLM):
    async def generate(self, *args: t.Any, **kwargs: t.Dict[str, t.Any]) -> str:
        return "Generated Response"

    async def generate_structured_output(self, prompt, schema=None, **kwargs):
        return QAQualityFeedback(feedback="Mock feedback", score=1.0)


class TestQAQualityMetric(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mock_model = MockLLM()
        self.metric = QAQuality(model=self.mock_model)
        self.test_case = LLMCase(
            user_input="What is the capital of France?",
            expected_output="The capital of France is Paris.",
            context=None,
        )

    async def test_compute_with_verbose(self):
        """测试callback的情况"""
        result = await self.metric.compute(self.test_case, verbose=True)
        self.assertEqual(result.score, 1.0)

    async def test_compute_with_context(self):
        """测试带上下文的计算"""
        self.test_case.context = ["France is a country in Europe."]
        result = await self.metric._compute(self.test_case)
        self.assertEqual(result.score, 1.0)
        self.assertIn("Mock feedback", result.reason)

    async def test_compute_without_context(self):
        """测试不带上下文的计算"""
        result = await self.metric._compute(self.test_case)
        self.assertEqual(result.score, 1.0)
        self.assertIn("Mock feedback", result.reason)

    async def test_compute_missing_user_input(self):
        """测试缺少 user_input 时抛出断言错误"""
        self.test_case.user_input = ""
        with self.assertRaises(AssertionError):
            await self.metric._compute(self.test_case)

    async def test_compute_missing_expected_output(self):
        """测试缺少 expected_output 时抛出断言错误"""
        self.test_case.expected_output = ""
        with self.assertRaises(AssertionError):
            await self.metric._compute(self.test_case)

    async def test_generate_quality_without_context(self):
        """测试无上下文时的质量生成"""
        result = await self.metric._generate_quality_without_context(
            self.test_case.user_input, self.test_case.expected_output, None
        )
        self.assertEqual(result.score, 1.0)
        self.assertIn("Mock feedback", result.reason)

    async def test_generate_quality_with_context(self):
        """测试有上下文时的质量生成"""
        result = await self.metric._generate_quality_with_context(
            self.test_case.user_input,
            self.test_case.expected_output,
            ["Context example."],
            None,
        )
        self.assertEqual(result.score, 1.0)
        self.assertIn("Mock feedback", result.reason)

    async def test_generate_quality_with_context_empty(self):
        """测试上下文为空时的质量生成"""
        result = await self.metric._generate_quality_with_context(
            self.test_case.user_input, self.test_case.expected_output, [], None
        )
        self.assertEqual(result.score, 1.0)
        self.assertIn("Mock feedback", result.reason)

    async def test_generate_quality_without_context_empty(self):
        """测试无上下文且输入为空时的质量生成"""
        result = await self.metric._generate_quality_without_context(
            self.test_case.user_input, self.test_case.expected_output, None
        )
        self.assertEqual(result.score, 1.0)
        self.assertIn("Mock feedback", result.reason)


if __name__ == "__main__":
    unittest.main()
