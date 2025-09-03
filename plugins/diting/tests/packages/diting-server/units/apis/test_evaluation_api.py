#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from fastapi import FastAPI
from diting_server.apis.v1.evaluation.api import router, run_evaluation
from diting_server.apis.v1.evaluation.data_models import (
    EvaluationRequest,
    EvaluationResponse,
    EvaluationResult,
)
from diting_server.common.schema import StatusEnum


class TestEvaluationAPI(unittest.IsolatedAsyncioTestCase):
    """Test cases for evaluation API endpoints."""

    def setUp(self):
        """Set up test fixtures."""
        self.app = FastAPI()
        self.app.include_router(router)
        self.client = TestClient(self.app)

    def test_router_configuration(self):
        """Test that the router is properly configured."""
        # Check router prefix and tags
        self.assertEqual(router.prefix, "/api/v1/evaluations")
        self.assertIn("evaluations", router.tags)

        # Check that the route exists
        routes = [route.path for route in router.routes]
        self.assertIn("/api/v1/evaluations/runs", routes)

    async def test_run_evaluation_success(self):
        """Test successful evaluation request."""
        # Mock request data
        request_data = {
            "llmConfig": {
                "name": "test-model",
                "baseUrl": "https://api.example.com",
                "apiKey": "test-key",
            },
            "metricConfig": {
                "metricName": "test_metric",
                "metricType": "builtin_metric",
            },
            "evalCase": {
                "userInput": "test input",
                "actualOutput": "test output",
                "expectedOutput": "expected output",
            },
        }

        # Mock evaluation service response
        mock_response = EvaluationResponse(
            request_id="eval-test-id",
            status=StatusEnum.SUCCESS,
            data=EvaluationResult(
                metric_name="test_metric", score=0.8, reason="Good result", run_logs={}
            ),
            usages=[],
            error=None,
        )

        with patch(
            "diting_server.apis.v1.evaluation.api.evaluation_service.run_evaluation",
            return_value=mock_response,
        ) as mock_service:
            response = await run_evaluation(EvaluationRequest(**request_data))

        self.assertIsInstance(response, EvaluationResponse)
        self.assertEqual(response.request_id, "eval-test-id")
        self.assertEqual(response.status, StatusEnum.SUCCESS)
        self.assertEqual(response.data.score, 0.8)
        self.assertIsNone(response.error)

        # Verify service was called
        mock_service.assert_called_once()

    async def test_run_evaluation_with_error(self):
        """Test evaluation request with service error."""
        # Mock request data
        request_data = {
            "llmConfig": {"name": "test-model"},
            "metricConfig": {"metricName": "test_metric"},
            "evalCase": {"userInput": "test input", "actualOutput": "test output"},
        }

        # Mock service to raise exception
        with patch(
            "diting_server.apis.v1.evaluation.api.evaluation_service.run_evaluation",
            side_effect=Exception("Service error"),
        ):
            with self.assertRaises(Exception):
                await run_evaluation(EvaluationRequest(**request_data))

    async def test_run_evaluation_request_id_generation(self):
        """Test that request ID is generated for each request."""
        request_data = {
            "llmConfig": {"name": "test-model"},
            "metricConfig": {"metricName": "test_metric"},
            "evalCase": {"userInput": "test input"},
        }

        mock_response = EvaluationResponse(
            request_id="eval-test-id",
            status=StatusEnum.SUCCESS,
            data=EvaluationResult(metric_name="test_metric", score=0.5),
            usages=[],
            error=None,
        )

        with patch(
            "diting_server.apis.v1.evaluation.api.evaluation_service.run_evaluation",
            return_value=mock_response,
        ) as mock_service:
            await run_evaluation(EvaluationRequest(**request_data))

            # Verify that the service was called with a generated request_id
            call_args = mock_service.call_args
            self.assertEqual(len(call_args[0]), 2)  # request and request_id
            request_id = call_args[0][1]
            self.assertIsInstance(request_id, str)
            self.assertGreater(len(request_id), 0)

    def test_run_evaluation_with_test_client_success(self):
        """Test evaluation endpoint using TestClient."""
        request_data = {
            "llmConfig": {
                "name": "test-model",
                "baseUrl": "https://api.example.com",
                "apiKey": "test-key",
            },
            "metricConfig": {
                "metricName": "test_metric",
                "metricType": "builtin_metric",
            },
            "evalCase": {
                "userInput": "test input",
                "actualOutput": "test output",
                "expectedOutput": "expected output",
            },
        }

        mock_response = EvaluationResponse(
            request_id="eval-test-id",
            status=StatusEnum.SUCCESS,
            data=EvaluationResult(
                metric_name="test_metric", score=0.8, reason="Good result", run_logs={}
            ),
            usages=[],
            error=None,
        )

        with patch(
            "diting_server.apis.v1.evaluation.api.evaluation_service.run_evaluation",
            return_value=mock_response,
        ):
            response = self.client.post("/api/v1/evaluations/runs", json=request_data)

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["requestId"], "eval-test-id")
        self.assertEqual(data["status"], "success")

    def test_run_evaluation_with_test_client_error(self):
        """Test evaluation endpoint with service error using TestClient."""
        request_data = {
            "llmConfig": {"name": "test-model"},
            "metricConfig": {"metricName": "test_metric"},
            "evalCase": {"userInput": "test input"},
        }

        with patch(
            "diting_server.apis.v1.evaluation.api.evaluation_service.run_evaluation",
            side_effect=Exception("Service error"),
        ):
            response = self.client.post("/api/v1/evaluations/runs", json=request_data)

        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn("detail", data)
        self.assertIn("Service error", data["detail"])

    def test_run_evaluation_invalid_request_data(self):
        """Test evaluation endpoint with invalid request data."""
        invalid_request_data = {
            "llmConfig": {
                "name": "test-model"
                # Missing required fields
            },
            "metricConfig": {"metricName": "test_metric"},
            # Missing evalCase
        }

        response = self.client.post(
            "/api/v1/evaluations/runs", json=invalid_request_data
        )
        self.assertEqual(response.status_code, 422)  # Validation error

    def test_run_evaluation_custom_metric(self):
        """Test evaluation endpoint with custom metric."""
        request_data = {
            "llmConfig": {"name": "test-model"},
            "metricConfig": {
                "metricName": "custom_metric",
                "metricType": "custom_metric",
                "prompt": "Custom evaluation prompt",
            },
            "evalCase": {"userInput": "test input", "actualOutput": "test output"},
        }

        mock_response = EvaluationResponse(
            request_id="eval-test-id",
            status=StatusEnum.SUCCESS,
            data=EvaluationResult(
                metric_name="custom_metric",
                score=0.7,
                reason="Custom evaluation result",
                run_logs={},
            ),
            usages=[],
            error=None,
        )

        with patch(
            "diting_server.apis.v1.evaluation.api.evaluation_service.run_evaluation",
            return_value=mock_response,
        ):
            response = self.client.post("/api/v1/evaluations/runs", json=request_data)

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["data"]["metricName"], "custom_metric")

    def test_run_evaluation_with_embedding_config(self):
        """Test evaluation endpoint with embedding configuration."""
        request_data = {
            "llmConfig": {"name": "test-model"},
            "embeddingConfig": {
                "name": "test-embedding",
                "baseUrl": "https://embedding.example.com",
                "apiKey": "embed-key",
            },
            "metricConfig": {"metricName": "test_metric"},
            "evalCase": {"userInput": "test input", "actualOutput": "test output"},
        }

        mock_response = EvaluationResponse(
            request_id="eval-test-id",
            status=StatusEnum.SUCCESS,
            data=EvaluationResult(
                metric_name="test_metric",
                score=0.9,
                reason="Excellent result",
                run_logs={},
            ),
            usages=[],
            error=None,
        )

        with patch(
            "diting_server.apis.v1.evaluation.api.evaluation_service.run_evaluation",
            return_value=mock_response,
        ):
            response = self.client.post("/api/v1/evaluations/runs", json=request_data)

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")

    def test_run_evaluation_logging(self):
        """Test that evaluation requests are properly logged."""
        request_data = {
            "llmConfig": {"name": "test-model"},
            "metricConfig": {"metricName": "test_metric"},
            "evalCase": {"userInput": "test input"},
        }

        mock_response = EvaluationResponse(
            request_id="eval-test-id",
            status=StatusEnum.SUCCESS,
            data=EvaluationResult(metric_name="test_metric", score=0.5),
            usages=[],
            error=None,
        )

        with patch(
            "diting_server.apis.v1.evaluation.api.evaluation_service.run_evaluation",
            return_value=mock_response,
        ) as _mock_service:
            with patch("diting_server.apis.v1.evaluation.api.logger") as mock_logger:
                response = self.client.post(
                    "/api/v1/evaluations/runs", json=request_data
                )

                self.assertEqual(response.status_code, 200)

        # Verify logging calls
        self.assertGreaterEqual(
            mock_logger.info.call_count, 2
        )  # Start and completion logs

        # Check that logging calls contain the expected patterns
        call_args_list = [call[0][0] for call in mock_logger.info.call_args_list]
        start_log_found = any(
            "Starting evaluation task, request_id:" in call for call in call_args_list
        )
        completion_log_found = any(
            "Evaluation task completed, request_id:" in call for call in call_args_list
        )

        self.assertTrue(start_log_found, "Starting evaluation task log not found")
        self.assertTrue(completion_log_found, "Evaluation task completed log not found")

    def test_run_evaluation_error_logging(self):
        """Test that evaluation errors are properly logged."""
        request_data = {
            "llmConfig": {"name": "test-model"},
            "metricConfig": {"metricName": "test_metric"},
            "evalCase": {"userInput": "test input"},
        }

        with patch(
            "diting_server.apis.v1.evaluation.api.evaluation_service.run_evaluation",
            side_effect=Exception("Service error"),
        ):
            with patch("diting_server.apis.v1.evaluation.api.logger") as mock_logger:
                response = self.client.post(
                    "/api/v1/evaluations/runs", json=request_data
                )

        self.assertEqual(response.status_code, 500)

        # Verify error logging
        mock_logger.error.assert_called_once()
        error_call_args = mock_logger.error.call_args[0]
        self.assertIn("Evaluation failed", error_call_args[0])
        self.assertIn("Service error", error_call_args[0])
