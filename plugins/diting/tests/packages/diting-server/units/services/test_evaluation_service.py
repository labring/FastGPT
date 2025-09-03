#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import unittest
from unittest.mock import MagicMock, patch, AsyncMock
from diting_server.services.evaluation.evaluation_service import EvaluationService
from diting_server.apis.v1.evaluation.data_models import (
    EvaluationRequest,
    EvaluationResponse,
    EvalCase,
    MetricConfig,
    ModelConfig,
    EvalMetricTypeEnum,
)
from diting_server.exceptions.evaluation import (
    ModelConfigException,
    MetricNotFoundException,
)
from diting_server.common.schema import StatusEnum
from diting_core.cases.llm_case import LLMCase


class TestEvaluationService(unittest.IsolatedAsyncioTestCase):
    """Test cases for EvaluationService class."""

    def setUp(self):
        """Set up test fixtures."""
        self.service = EvaluationService()

    def test_init(self):
        """Test EvaluationService initialization."""
        service = EvaluationService()
        self.assertIsNotNone(service)

    async def test_run_evaluation_success(self):
        """Test successful evaluation run."""
        # Mock request
        request = EvaluationRequest(
            llm_config=ModelConfig(name="test-model"),
            metric_config=MetricConfig(metric_name="test_metric"),
            eval_case=EvalCase(
                user_input="test input",
                actual_output="test output",
                expected_output="expected output",
            ),
        )
        request_id = "test-request-id"

        # Mock the internal evaluation method
        mock_result = {
            "metric_value": MagicMock(score=0.8, reason="Good result", run_logs={}),
            "usages": [],
            "error": None,
        }

        with patch.object(
            self.service, "_evaluate_case_with_metric", return_value=mock_result
        ):
            response = await self.service.run_evaluation(request, request_id)

        self.assertIsInstance(response, EvaluationResponse)
        self.assertEqual(response.request_id, f"eval-{request_id}")
        self.assertEqual(response.status, StatusEnum.SUCCESS)
        self.assertIsNotNone(response.data)
        if response.data is not None:  # Type guard for linter
            self.assertEqual(response.data.score, 0.8)
            self.assertEqual(response.data.reason, "Good result")
        self.assertIsNone(response.error)

    async def test_run_evaluation_with_error(self):
        """Test evaluation run with error."""
        # Mock request
        request = EvaluationRequest(
            llm_config=ModelConfig(name="test-model"),
            metric_config=MetricConfig(metric_name="test_metric"),
            eval_case=EvalCase(
                user_input="test input",
                actual_output="test output",
                expected_output="expected output",
            ),
        )
        request_id = "test-request-id"

        # Mock the internal evaluation method with error
        mock_result = {
            "metric_value": None,
            "usages": [],
            "error": "Test error occurred",
        }

        with patch.object(
            self.service, "_evaluate_case_with_metric", return_value=mock_result
        ):
            response = await self.service.run_evaluation(request, request_id)

        self.assertIsInstance(response, EvaluationResponse)
        self.assertEqual(response.request_id, f"eval-{request_id}")
        self.assertEqual(response.status, StatusEnum.FAILED)
        self.assertIsNotNone(response.data)
        if response.data is not None:  # Type guard for linter
            self.assertEqual(response.data.score, 0)
            self.assertEqual(response.data.reason, "Test error occurred")
        self.assertEqual(response.error, "Test error occurred")

    async def test_run_evaluation_model_config_exception(self):
        """Test evaluation run with ModelConfigException."""
        # Mock request
        request = EvaluationRequest(
            llm_config=ModelConfig(name="test-model"),
            metric_config=MetricConfig(metric_name="test_metric"),
            eval_case=EvalCase(
                user_input="test input",
                actual_output="test output",
                expected_output="expected output",
            ),
        )
        request_id = "test-request-id"

        # Mock the internal evaluation method to raise exception
        with patch.object(
            self.service,
            "_evaluate_case_with_metric",
            side_effect=ModelConfigException("Model config error"),
        ):
            with self.assertRaises(ModelConfigException):
                await self.service.run_evaluation(request, request_id)

    async def test_run_evaluation_metric_not_found_exception(self):
        """Test evaluation run with MetricNotFoundException."""
        # Mock request
        request = EvaluationRequest(
            llm_config=ModelConfig(name="test-model"),
            metric_config=MetricConfig(metric_name="test_metric"),
            eval_case=EvalCase(
                user_input="test input",
                actual_output="test output",
                expected_output="expected output",
            ),
        )
        request_id = "test-request-id"

        # Mock the internal evaluation method to raise exception
        with patch.object(
            self.service,
            "_evaluate_case_with_metric",
            side_effect=MetricNotFoundException("Metric not found"),
        ):
            with self.assertRaises(MetricNotFoundException):
                await self.service.run_evaluation(request, request_id)

    async def test_evaluate_case_with_metric_builtin_metric(self):
        """Test _evaluate_case_with_metric with builtin metric."""
        # Mock case and configs
        case = LLMCase(
            user_input="test input",
            actual_output="test output",
            expected_output="expected output",
        )
        metric_config = MetricConfig(metric_name="test_metric")
        llm_config = ModelConfig(name="test-model")
        embedding_config = ModelConfig(name="test-embedding")

        # Mock metric loading
        mock_metric = MagicMock()
        mock_metric.compute = AsyncMock(
            return_value=MagicMock(score=0.9, reason="Excellent", run_logs={})
        )
        # Remove model attributes to avoid requiring LLM/embedding config
        del mock_metric.model
        del mock_metric.embedding_model
        mock_metric_class = MagicMock(return_value=mock_metric)

        with patch.object(self.service, "_load_metric", return_value=mock_metric_class):
            with patch(
                "diting_engine.common.utils.compute_token_usage", return_value=[]
            ):
                result = await self.service._evaluate_case_with_metric(
                    case, metric_config, llm_config, embedding_config
                )

        self.assertIn("metric_value", result)
        self.assertIn("usages", result)
        self.assertIn("error", result)
        self.assertIsNone(result["error"])

    async def test_evaluate_case_with_metric_custom_metric(self):
        """Test _evaluate_case_with_metric with custom metric."""
        # Mock case and configs
        case = LLMCase(
            user_input="test input",
            actual_output="test output",
            expected_output="expected output",
        )
        metric_config = MetricConfig(
            metric_name="custom_metric",
            metric_type=EvalMetricTypeEnum.Custom,
            prompt="Custom evaluation prompt",
        )
        llm_config = ModelConfig(name="test-model")

        # Mock metric loading
        mock_metric = MagicMock()
        mock_metric.compute = AsyncMock(
            return_value=MagicMock(score=0.7, reason="Good", run_logs={})
        )
        # Remove model attributes to avoid requiring LLM/embedding config
        del mock_metric.model
        del mock_metric.embedding_model
        mock_metric_class = MagicMock(return_value=mock_metric)

        with patch.object(self.service, "_load_metric", return_value=mock_metric_class):
            with patch(
                "diting_engine.common.utils.compute_token_usage", return_value=[]
            ):
                result = await self.service._evaluate_case_with_metric(
                    case, metric_config, llm_config
                )

        # Check that metadata was set with prompt
        self.assertEqual(case.metadata, {"prompt": "Custom evaluation prompt"})
        self.assertIn("metric_value", result)
        self.assertIsNone(result["error"])

    async def test_evaluate_case_with_metric_custom_metric_no_prompt(self):
        """Test _evaluate_case_with_metric with custom metric but no prompt."""
        # Mock case and configs
        case = LLMCase(
            user_input="test input",
            actual_output="test output",
            expected_output="expected output",
        )
        metric_config = MetricConfig(
            metric_name="custom_metric",
            metric_type=EvalMetricTypeEnum.Custom,
            prompt="",  # Empty prompt
        )

        with self.assertRaisesRegex(
            MetricNotFoundException, "Failed to load the metric custom_metric"
        ):
            await self.service._evaluate_case_with_metric(case, metric_config)

    async def test_evaluate_case_with_metric_llm_required_no_config(self):
        """Test _evaluate_case_with_metric when LLM is required but not configured."""
        # Mock case and configs
        case = LLMCase(
            user_input="test input",
            actual_output="test output",
            expected_output="expected output",
        )
        metric_config = MetricConfig(metric_name="test_metric")

        # Mock metric that requires LLM
        mock_metric = MagicMock()
        mock_metric.model = None  # Has model attribute
        mock_metric_class = MagicMock(return_value=mock_metric)

        with patch.object(self.service, "_load_metric", return_value=mock_metric_class):
            with self.assertRaisesRegex(ModelConfigException, "LLM model is required"):
                await self.service._evaluate_case_with_metric(case, metric_config)

    async def test_evaluate_case_with_metric_embedding_required_no_config(self):
        """Test _evaluate_case_with_metric when embedding is required but not configured."""
        # Mock case and configs
        case = LLMCase(
            user_input="test input",
            actual_output="test output",
            expected_output="expected output",
        )
        metric_config = MetricConfig(metric_name="test_metric")
        # Don't pass llm_config to avoid LLM factory initialization

        # Mock metric that requires embedding but not LLM
        mock_metric = MagicMock()
        # Remove model attribute to avoid requiring LLM config
        del mock_metric.model
        # Keep embedding_model attribute to require embedding config
        mock_metric.embedding_model = None
        mock_metric_class = MagicMock(return_value=mock_metric)

        with patch.object(self.service, "_load_metric", return_value=mock_metric_class):
            with self.assertRaisesRegex(
                ModelConfigException, "Embedding model is required"
            ):
                await self.service._evaluate_case_with_metric(case, metric_config)

    async def test_evaluate_case_with_metric_compute_error(self):
        """Test _evaluate_case_with_metric when metric compute fails."""
        # Mock case and configs
        case = LLMCase(
            user_input="test input",
            actual_output="test output",
            expected_output="expected output",
        )
        metric_config = MetricConfig(metric_name="test_metric")

        # Mock metric that raises exception during compute
        mock_metric = MagicMock()
        mock_metric.compute = AsyncMock(side_effect=Exception("Compute error"))
        # Remove model attributes to avoid requiring LLM/embedding config
        del mock_metric.model
        del mock_metric.embedding_model
        mock_metric_class = MagicMock(return_value=mock_metric)

        with patch.object(self.service, "_load_metric", return_value=mock_metric_class):
            with patch(
                "diting_engine.common.utils.compute_token_usage", return_value=[]
            ):
                result = await self.service._evaluate_case_with_metric(
                    case, metric_config
                )

        self.assertIsNone(result["metric_value"])
        self.assertEqual(result["error"], "Compute error")
        self.assertEqual(result["usages"], [])

    def test_load_metric(self):
        """Test _load_metric method."""
        # Mock MetricFactory
        mock_metric_class = MagicMock()
        mock_factory = MagicMock()
        mock_factory.create.return_value = mock_metric_class

        with patch(
            "diting_engine.services.evaluation.evaluation_service.MetricFactory",
            return_value=mock_factory,
        ):
            result = self.service._load_metric("test_metric")

        self.assertEqual(result, mock_metric_class)
        mock_factory.create.assert_called_once_with("test_metric")


if __name__ == "__main__":
    unittest.main()
