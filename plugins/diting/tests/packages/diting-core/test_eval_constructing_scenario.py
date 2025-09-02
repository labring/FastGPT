import unittest
from diting_core.cases.llm_case import LLMCase
from diting_core.metrics.base_metric import BaseMetric, MetricValue
from typing import Any

from diting_core.models.llms.base_model import BaseLLM


# 1. Define a metric, implementing the algorithm
class MockMetric(BaseMetric):
    def __init__(
        self,
        model: BaseLLM | None,
    ):
        self.model = model

    async def _compute(
        self, test_case: LLMCase, *args: Any, **kwargs: Any
    ) -> MetricValue:
        # Example logic for computing a metric
        if test_case.user_input == "error":
            raise ValueError("Invalid input")
        return MetricValue(score=1.0)


class TestBaseMetric(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        # 2. Construct the evaluation metric, depending on the model being evaluated
        self.metric = MockMetric(model=None)

    async def test_compute_valid_case(self):
        test_case = LLMCase(user_input="Valid input", actual_output="Output")
        kwargs: dict[str, Any] = {"debug": True}
        result = await self.metric.compute(test_case, **kwargs)
        self.assertEqual(result.score, 1.0)

    async def test_compute_error_case(self):
        test_case = LLMCase(user_input="error", actual_output="Output")
        with self.assertRaises(ValueError) as context:
            await self.metric.compute(test_case)
        self.assertEqual(str(context.exception), "Invalid input")


if __name__ == "__main__":
    # metric = MockMetric(model=None)
    # test_case = LLMCase(user_input="Valid input", actual_output="Output")
    # kwargs:Dict[str, Any] = {"debug": True}
    # import asyncio
    # asyncio.run(metric.compute(test_case, **kwargs))
    unittest.main()
