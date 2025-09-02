import unittest
from typing import Any
from typing import Dict
from unittest.mock import AsyncMock

from diting_core.cases.llm_case import LLMCase, LLMCaseParams, assert_testcase_validity
from diting_core.metrics.base_metric import BaseMetric, MetricValue


class MockBaseMetric(BaseMetric):
    async def _compute(
        self, test_case: LLMCase, *args: Any, **kwargs: Any
    ) -> MetricValue:
        return MetricValue(score=1.0)


class TestBaseMetric(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.metric = MockBaseMetric()
        self.test_case = LLMCase(user_input="Test input", actual_output="Test output")

    async def test_compute(self):
        result = await self.metric.compute(self.test_case)
        self.assertEqual(result.score, 1.0)

    async def test_compute_exception_handling(self):
        metric = MockBaseMetric()
        metric._compute = AsyncMock()
        metric._compute.side_effect = ValueError("Simulated computation error")
        with self.assertRaises(ValueError) as context:
            kwargs: Dict[str, Any] = {"debug": True}
            await metric.compute(self.test_case, **kwargs)
        self.assertEqual(str(context.exception), "Simulated computation error")


class TestAssertTestcaseValidity(unittest.TestCase):
    def test_assert_valid_with_no_required_params(self):
        """测试 required_params 为 None 的情况"""
        test_case = LLMCase(user_input="test", actual_output="test")
        assert_testcase_validity("test_metric", test_case, None)

    def test_assert_valid_with_missing_one_param(self):
        """测试缺失单个参数的情况"""
        test_case = LLMCase(user_input=None, actual_output="test")
        required_params = [LLMCaseParams.USER_INPUT]
        with self.assertRaises(ValueError) as context:
            assert_testcase_validity("test_metric", test_case, required_params)
        self.assertEqual(
            str(context.exception),
            "'user_input' cannot be None for the 'test_metric' run",
        )

    def test_assert_valid_with_missing_two_params(self):
        """测试缺失两个参数的情况"""
        test_case = LLMCase(user_input=None, actual_output=None)
        required_params = [LLMCaseParams.USER_INPUT, LLMCaseParams.ACTUAL_OUTPUT]
        with self.assertRaises(ValueError) as context:
            assert_testcase_validity("test_metric", test_case, required_params)
        self.assertEqual(
            str(context.exception),
            "'user_input' and 'actual_output' cannot be None for the 'test_metric' run",
        )

    def test_assert_valid_with_missing_three_params(self):
        """测试缺失三个参数的情况"""
        test_case = LLMCase(user_input=None, actual_output=None, expected_output=None)
        required_params = [
            LLMCaseParams.USER_INPUT,
            LLMCaseParams.ACTUAL_OUTPUT,
            LLMCaseParams.EXPECTED_OUTPUT,
        ]
        with self.assertRaises(ValueError) as context:
            assert_testcase_validity("test_metric", test_case, required_params)
        self.assertEqual(
            str(context.exception),
            "'user_input', 'actual_output', and 'expected_output' cannot be None for the 'test_metric' run",
        )

    def test_assert_valid_with_all_params_present(self):
        """测试所有参数都存在的正常情况"""
        test_case = LLMCase(
            user_input="value", actual_output="value", expected_output="value"
        )
        required_params = [
            LLMCaseParams.USER_INPUT,
            LLMCaseParams.ACTUAL_OUTPUT,
            LLMCaseParams.EXPECTED_OUTPUT,
        ]
        assert_testcase_validity("test_metric", test_case, required_params)

    def test_assert_valid_with_empty_required_params(self):
        """测试 required_params 为空集合的情况"""
        test_case = LLMCase(user_input="value", actual_output="value")
        required_params = None
        assert_testcase_validity("test_metric", test_case, required_params)

    def test_assert_valid_with_missing_multiple_params(self):
        """测试缺失多个参数（超过三个）的情况"""
        test_case = LLMCase()
        required_params = [
            LLMCaseParams.USER_INPUT,
            LLMCaseParams.ACTUAL_OUTPUT,
            LLMCaseParams.EXPECTED_OUTPUT,
            LLMCaseParams.CONTEXT,
        ]
        with self.assertRaises(ValueError) as context:
            assert_testcase_validity("test_metric", test_case, required_params)
        expected_error = "'user_input', 'actual_output', 'expected_output', and 'context' cannot be None for the 'test_metric' run"
        self.assertEqual(str(context.exception), expected_error)

    def test_assert_valid_with_missing_params_and_custom_metric_name(self):
        """测试自定义 metric_name 的错误信息"""
        test_case = LLMCase(user_input=None, actual_output="test")
        required_params = [LLMCaseParams.USER_INPUT]
        with self.assertRaises(ValueError) as context:
            assert_testcase_validity("custom_metric", test_case, required_params)
        self.assertEqual(
            str(context.exception),
            "'user_input' cannot be None for the 'custom_metric' run",
        )

    def test_assert_valid_with_missing_params_and_multiple_missing(self):
        """测试多个参数缺失时的错误信息格式"""
        test_case = LLMCase(
            user_input=None, actual_output=None, expected_output="value"
        )
        required_params = [
            LLMCaseParams.USER_INPUT,
            LLMCaseParams.ACTUAL_OUTPUT,
            LLMCaseParams.EXPECTED_OUTPUT,
        ]
        with self.assertRaises(ValueError) as context:
            assert_testcase_validity("test_metric", test_case, required_params)
        expected_error = (
            "'user_input' and 'actual_output' cannot be None for the 'test_metric' run"
        )
        self.assertEqual(str(context.exception), expected_error)


if __name__ == "__main__":
    unittest.main()
