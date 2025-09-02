import unittest
from typing import Any, Tuple, Dict
from unittest.mock import patch

from diting_core.metrics.answer_relevancy.answer_relevancy import (
    AnswerRelevancy,
    _calculate_score,
)
from diting_core.cases.llm_case import LLMCase
from diting_core.metrics.answer_relevancy.schema import (
    Verdicts,
    AnswerRelevancyVerdict,
    Statements,
    Reason,
)
from diting_core.models.llms.base_model import (
    BaseLLM,
)


class MockLLM(BaseLLM):
    async def generate(self, *args: Tuple[Any], **kwargs: Dict[str, Any]) -> str:
        return "Generated Response"

    async def generate_structured_output(
        self,
        prompt: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        return {"testkey": "testval"}


class TestAnswerRelevancyMetric(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mock_model = MockLLM()
        self.metric = AnswerRelevancy(model=self.mock_model)
        self.test_case = LLMCase(
            user_input="Test question",
            actual_output="Test answer",
            expected_output="Expected answer",
        )

    async def test_compute_with_verbose(self):
        """测试callback的情况"""
        with patch.object(
            self.metric, "_a_generate_statements", return_value=["statement1"]
        ):
            with patch.object(
                self.metric,
                "_a_generate_verdicts",
                return_value=[AnswerRelevancyVerdict(verdict="yes")],
            ):
                with patch.object(
                    self.metric, "_a_generate_reason", return_value="Test reason"
                ):
                    result = await self.metric.compute(self.test_case, verbose=True)
                    self.assertEqual(result.score, 1.0)
                    assert result.run_logs
                    self.assertEqual(result.run_logs["statements"], ["statement1"])
                    self.assertEqual(
                        result.run_logs["verdicts"],
                        [AnswerRelevancyVerdict(verdict="yes")],
                    )

    async def test_calculate_score_all_relevant(self):
        """测试所有verdict为'yes'或'idk'的情况"""
        verdicts = [
            AnswerRelevancyVerdict(verdict="yes"),
            AnswerRelevancyVerdict(verdict="idk"),
        ]
        score = _calculate_score(verdicts)
        self.assertEqual(score, 1.0)

    async def test_calculate_score_mixed(self):
        """测试混合'yes'、'no'、'idk'的情况"""
        verdicts = [
            AnswerRelevancyVerdict(verdict="yes"),
            AnswerRelevancyVerdict(verdict="no"),
            AnswerRelevancyVerdict(verdict="idk"),
        ]
        score = _calculate_score(verdicts)
        self.assertEqual(score, 2 / 3)

    async def test_calculate_score_empty(self):
        """测试verdicts为空时返回1"""
        score = _calculate_score([])
        self.assertEqual(score, 1.0)

    async def test_calculate_score_all_irrelevant(self):
        """测试所有verdict为'no'的情况"""
        verdicts = [AnswerRelevancyVerdict(verdict="no") for _ in range(3)]
        score = _calculate_score(verdicts)
        self.assertEqual(score, 0.0)

    async def test_calculate_score_with_idk(self):
        """测试包含'idk'的verdict处理"""
        verdicts = [
            AnswerRelevancyVerdict(verdict="idk"),
            AnswerRelevancyVerdict(verdict="no"),
        ]
        score = _calculate_score(verdicts)
        self.assertEqual(score, 0.5)

    async def test_compute_valid_case(self):
        """测试正常情况下的compute"""
        with patch.object(
            self.metric, "_a_generate_statements", return_value=["statement1"]
        ):
            with patch.object(
                self.metric,
                "_a_generate_verdicts",
                return_value=[AnswerRelevancyVerdict(verdict="yes")],
            ):
                with patch.object(
                    self.metric,
                    "_a_generate_reason",
                    return_value=Reason(reason="test"),
                ):
                    result = await self.metric._compute(self.test_case)
                    self.assertEqual(result.score, 1.0)
                    assert result.run_logs
                    self.assertEqual(result.run_logs["statements"], ["statement1"])
                    self.assertEqual(
                        result.run_logs["verdicts"],
                        [AnswerRelevancyVerdict(verdict="yes")],
                    )

    async def test_compute_missing_input(self):
        """测试缺少user_input时抛出断言错误"""
        test_case = LLMCase(
            user_input="", actual_output="Output", expected_output="Expected"
        )
        with self.assertRaises(AssertionError):
            await self.metric.compute(test_case, verbose=True)

    async def test_compute_missing_output(self):
        """测试缺少actual_output时抛出断言错误"""
        test_case = LLMCase(
            user_input="Input", actual_output="", expected_output="Expected"
        )
        with self.assertRaises(AssertionError):
            await self.metric._compute(test_case)

    async def test_a_generate_statements(self):
        """测试生成statements的逻辑"""
        with patch.object(
            self.mock_model,
            "generate_structured_output",
            return_value=Statements(statements=["test"]),
        ):
            statements = await self.metric._a_generate_statements("test output")
            self.assertEqual(statements, ["test"])

    async def test_a_generate_verdicts_empty_statements(self):
        """测试statements为空时返回空列表"""
        verdicts = await self.metric._a_generate_verdicts("input", [])
        self.assertEqual(verdicts, [])

    async def test_a_generate_verdicts_with_statements(self):
        """测试生成verdicts的逻辑"""
        with patch.object(
            self.mock_model,
            "generate_structured_output",
            return_value=Verdicts(
                verdicts=[
                    AnswerRelevancyVerdict(verdict="yes"),
                    AnswerRelevancyVerdict(verdict="no"),
                ]
            ),
        ):
            verdicts = await self.metric._a_generate_verdicts(
                "input", ["statement1", "statement2"]
            )
            self.assertEqual(len(verdicts), 2)
            self.assertEqual(verdicts[0].verdict, "yes")
            self.assertEqual(verdicts[1].verdict, "no")

    async def test_a_generate_reason_with_irrelevant(self):
        """测试生成reason时包含不相关陈述"""
        verdicts = [
            AnswerRelevancyVerdict(verdict="no", reason="Irrelevant1"),
            AnswerRelevancyVerdict(verdict="idk", reason="Idk1"),
        ]
        with patch.object(
            self.mock_model,
            "generate_structured_output",
            return_value=Reason(reason="Combined reasons"),
        ):
            reason = await self.metric._a_generate_reason("input", 0.5, verdicts)
            self.assertEqual(reason, "Combined reasons")

    async def test_a_generate_reason_no_irrelevant(self):
        """测试没有不相关陈述时生成空reason"""
        verdicts = [AnswerRelevancyVerdict(verdict="yes", reason="Relevant1")]
        with patch.object(
            self.mock_model,
            "generate_structured_output",
            return_value=Reason(reason=""),
        ):
            reason = await self.metric._a_generate_reason("input", 1.0, verdicts)
            self.assertEqual(reason, "")

    async def test_compute_with_include_reason(self):
        """测试include_reason为True时生成reason"""
        self.metric.include_reason = True
        with patch.object(
            self.metric, "_a_generate_statements", return_value=["statement1"]
        ):
            with patch.object(
                self.metric,
                "_a_generate_verdicts",
                return_value=[AnswerRelevancyVerdict(verdict="yes")],
            ):
                with patch.object(
                    self.metric, "_a_generate_reason", return_value="Test reason"
                ):
                    result = await self.metric._compute(self.test_case)
                self.assertEqual(result.score, 1.0)
                self.assertEqual(result.reason, "Test reason")

    async def test_compute_with_all_irrelevant(self):
        """测试所有verdict为'no'时得分0"""
        verdicts = [AnswerRelevancyVerdict(verdict="no") for _ in range(3)]
        with patch.object(
            self.metric, "_a_generate_statements", return_value=["s1", "s2", "s3"]
        ):
            with patch.object(
                self.metric, "_a_generate_verdicts", return_value=verdicts
            ):
                with patch.object(
                    self.metric, "_a_generate_reason", return_value="Test reason"
                ):
                    result = await self.metric._compute(self.test_case)
                    self.assertEqual(result.score, 0.0)

    async def test_compute_with_partial_irrelevant(self):
        """测试部分verdict为'no'时得分正确"""
        verdicts = [
            AnswerRelevancyVerdict(verdict="yes"),
            AnswerRelevancyVerdict(verdict="no"),
            AnswerRelevancyVerdict(verdict="idk"),
        ]
        with patch.object(
            self.metric, "_a_generate_statements", return_value=["s1", "s2", "s3"]
        ):
            with patch.object(
                self.metric, "_a_generate_verdicts", return_value=verdicts
            ):
                with patch.object(
                    self.metric, "_a_generate_reason", return_value="Test reason"
                ):
                    result = await self.metric._compute(self.test_case)
                    self.assertEqual(result.score, 2 / 3)

    async def test_compute_with_idk(self):
        """测试包含'idk'的verdict处理"""
        verdicts = [
            AnswerRelevancyVerdict(verdict="idk"),
            AnswerRelevancyVerdict(verdict="no"),
        ]
        with patch.object(
            self.metric, "_a_generate_statements", return_value=["s1", "s2"]
        ):
            with patch.object(
                self.metric, "_a_generate_verdicts", return_value=verdicts
            ):
                with patch.object(
                    self.metric, "_a_generate_reason", return_value="Test reason"
                ):
                    result = await self.metric._compute(self.test_case)
                    self.assertEqual(result.score, 0.5)

    async def test_compute_with_no_statements_and_no_verdicts(self):
        """测试statements和verdicts都为空时返回1.0"""
        with patch.object(self.metric, "_a_generate_statements", return_value=[]):
            with patch.object(self.metric, "_a_generate_verdicts", return_value=[]):
                with patch.object(
                    self.metric, "_a_generate_reason", return_value="Test reason"
                ):
                    result = await self.metric._compute(self.test_case)
                    self.assertEqual(result.score, 1.0)

    async def test_compute_with_statements_but_no_verdicts(self):
        """测试有statements但verdicts为空时返回1.0"""
        with patch.object(self.metric, "_a_generate_statements", return_value=["s1"]):
            with patch.object(self.metric, "_a_generate_verdicts", return_value=[]):
                with patch.object(
                    self.metric, "_a_generate_reason", return_value="Test reason"
                ):
                    result = await self.metric._compute(self.test_case)
                    self.assertEqual(result.score, 1.0)

    async def test_compute_with_statements_and_all_yes(self):
        """测试statements存在且所有verdict为'yes'"""
        statements = ["s1", "s2"]
        verdicts = [AnswerRelevancyVerdict(verdict="yes") for _ in range(2)]
        with patch.object(
            self.metric, "_a_generate_statements", return_value=statements
        ):
            with patch.object(
                self.metric, "_a_generate_verdicts", return_value=verdicts
            ):
                with patch.object(
                    self.metric, "_a_generate_reason", return_value="Test reason"
                ):
                    result = await self.metric._compute(self.test_case)
                    self.assertEqual(result.score, 1.0)

    async def test_compute_with_statements_and_all_no(self):
        """测试statements存在且所有verdict为'no'"""
        statements = ["s1", "s2"]
        verdicts = [AnswerRelevancyVerdict(verdict="no") for _ in range(2)]
        with patch.object(
            self.metric, "_a_generate_statements", return_value=statements
        ):
            with patch.object(
                self.metric, "_a_generate_verdicts", return_value=verdicts
            ):
                with patch.object(
                    self.metric, "_a_generate_reason", return_value="Test reason"
                ):
                    result = await self.metric._compute(self.test_case)
                    self.assertEqual(result.score, 0.0)

    async def test_compute_with_statements_and_mixed_verdicts(self):
        """测试statements存在且混合'yes'、'no'、'idk'"""
        statements = ["s1", "s2", "s3"]
        verdicts = [
            AnswerRelevancyVerdict(verdict="yes"),
            AnswerRelevancyVerdict(verdict="no"),
            AnswerRelevancyVerdict(verdict="idk"),
        ]
        with patch.object(
            self.metric, "_a_generate_statements", return_value=statements
        ):
            with patch.object(
                self.metric, "_a_generate_verdicts", return_value=verdicts
            ):
                with patch.object(
                    self.metric, "_a_generate_reason", return_value="Test reason"
                ):
                    result = await self.metric._compute(self.test_case)
                    self.assertEqual(
                        result.score, 2 / 3
                    )  # "yes"和"idk"视为相关，"no"不相关


if __name__ == "__main__":
    unittest.main()
