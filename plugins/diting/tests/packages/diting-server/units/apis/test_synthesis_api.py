#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from fastapi import FastAPI
from diting_server.apis.v1.synthesis.api import router, run_synthesis
from diting_server.apis.v1.synthesis.data_models import (
    DatasetSynthesisRequest,
    DatasetSynthesisResponse,
    QAPair,
    SyntheticQAResult,
)
from diting_server.common.schema import StatusEnum


class TestSynthesisAPI(unittest.IsolatedAsyncioTestCase):
    """Test cases for synthesis API endpoints."""

    def setUp(self):
        """Set up test fixtures."""
        self.app = FastAPI()
        self.app.include_router(router)
        self.client = TestClient(self.app)

    def test_router_configuration(self):
        """Test that the router is properly configured."""
        # Check router prefix and tags
        self.assertEqual(router.prefix, "/api/v1/dataset-synthesis")
        self.assertIn("dataset-synthesis", router.tags)

        # Check that the route exists
        routes = [route.path for route in router.routes]
        self.assertIn("/api/v1/dataset-synthesis/runs", routes)

    async def test_run_synthesis_success(self):
        """Test successful synthesis request."""
        # Mock request data
        request_data = {
            "llmConfig": {
                "name": "test-model",
                "baseUrl": "https://api.example.com",
                "apiKey": "test-key",
            },
            "synthesizerConfig": {"synthesizerName": "test_synthesizer"},
            "inputData": {"context": ["test context"], "themes": ["test theme"]},
        }

        # Mock synthesis service response
        mock_response = DatasetSynthesisResponse(
            request_id="test-id",
            status=StatusEnum.SUCCESS,
            data=SyntheticQAResult(
                qa_pair=QAPair(question="test question", answer="test answer"),
                metadata={"test": "metadata"},
            ),
            usages=[],
            metadata=None,
            error=None,
        )

        with patch(
            "diting_engine.apis.v1.synthesis.api.synthesizer_service.run_synthesizer",
            return_value=mock_response,
        ) as mock_service:
            response = await run_synthesis(DatasetSynthesisRequest(**request_data))

        self.assertIsInstance(response, DatasetSynthesisResponse)
        self.assertEqual(response.request_id, "test-id")
        self.assertEqual(response.status, StatusEnum.SUCCESS)
        self.assertEqual(response.data.qa_pair.question, "test question")
        self.assertEqual(response.data.qa_pair.answer, "test answer")
        self.assertIsNone(response.error)

        # Verify service was called
        mock_service.assert_called_once()

    async def test_run_synthesis_with_error(self):
        """Test synthesis request with service error."""
        # Mock request data
        request_data = {
            "llmConfig": {"name": "test-model"},
            "synthesizerConfig": {"synthesizerName": "test_synthesizer"},
            "inputData": {"context": ["test context"]},
        }

        # Mock service to raise exception
        with patch(
            "diting_engine.apis.v1.synthesis.api.synthesizer_service.run_synthesizer",
            side_effect=Exception("Service error"),
        ):
            with self.assertRaises(Exception):
                await run_synthesis(DatasetSynthesisRequest(**request_data))

    def test_run_synthesis_with_test_client_success(self):
        """Test synthesis endpoint using TestClient."""
        request_data = {
            "llmConfig": {
                "name": "test-model",
                "baseUrl": "https://api.example.com",
                "apiKey": "test-key",
            },
            "synthesizerConfig": {"synthesizerName": "test_synthesizer"},
            "inputData": {"context": ["test context"], "themes": ["test theme"]},
        }

        mock_response = DatasetSynthesisResponse(
            request_id="test-id",
            status=StatusEnum.SUCCESS,
            data=SyntheticQAResult(
                qa_pair=QAPair(question="test question", answer="test answer"),
                metadata={"test": "metadata"},
            ),
            usages=[],
            metadata=None,
            error=None,
        )

        with patch(
            "diting_engine.apis.v1.synthesis.api.synthesizer_service.run_synthesizer",
            return_value=mock_response,
        ):
            response = self.client.post(
                "/api/v1/dataset-synthesis/runs", json=request_data
            )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["requestId"], "test-id")
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["data"]["qaPair"]["question"], "test question")
        self.assertEqual(data["data"]["qaPair"]["answer"], "test answer")

    def test_run_synthesis_with_test_client_error(self):
        """Test synthesis endpoint with service error using TestClient."""
        request_data = {
            "llmConfig": {"name": "test-model"},
            "synthesizerConfig": {"synthesizerName": "test_synthesizer"},
            "inputData": {"context": ["test context"]},
        }

        with patch(
            "diting_engine.apis.v1.synthesis.api.synthesizer_service.run_synthesizer",
            side_effect=Exception("Service error"),
        ):
            response = self.client.post(
                "/api/v1/dataset-synthesis/runs", json=request_data
            )

        self.assertEqual(response.status_code, 500)
        data = response.json()
        self.assertIn("detail", data)
        self.assertIn("Service error", data["detail"])

    def test_run_synthesis_invalid_request_data(self):
        """Test synthesis endpoint with invalid request data."""
        invalid_request_data = {
            "llmConfig": {
                "name": "test-model"
                # Missing required fields
            },
            "synthesizerConfig": {"synthesizerName": "test_synthesizer"},
            # Missing inputData
        }

        response = self.client.post(
            "/api/v1/dataset-synthesis/runs", json=invalid_request_data
        )
        self.assertEqual(response.status_code, 422)  # Validation error

    def test_run_synthesis_with_embedding_config(self):
        """Test synthesis endpoint with embedding configuration."""
        request_data = {
            "llmConfig": {"name": "test-model"},
            "embeddingConfig": {
                "name": "test-embedding",
                "baseUrl": "https://embedding.example.com",
                "apiKey": "embed-key",
            },
            "synthesizerConfig": {"synthesizerName": "test_synthesizer"},
            "inputData": {"context": ["test context"]},
        }

        mock_response = DatasetSynthesisResponse(
            request_id="test-id",
            status=StatusEnum.SUCCESS,
            data=SyntheticQAResult(
                qa_pair=QAPair(question="test question", answer="test answer"),
                metadata={},
            ),
            usages=[],
            metadata=None,
            error=None,
        )

        with patch(
            "diting_engine.apis.v1.synthesis.api.synthesizer_service.run_synthesizer",
            return_value=mock_response,
        ):
            response = self.client.post(
                "/api/v1/dataset-synthesis/runs", json=request_data
            )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")

    def test_run_synthesis_with_metadata(self):
        """Test synthesis endpoint with metadata."""
        request_data = {
            "metadata": {
                "chunkId": "chunk-1",
                "totalChunks": 10,
                "projectName": "test-project",
                "createdAt": "2023-01-01T00:00:00Z",
            },
            "llmConfig": {"name": "test-model"},
            "synthesizerConfig": {"synthesizerName": "test_synthesizer"},
            "inputData": {"context": ["test context"]},
        }

        mock_response = DatasetSynthesisResponse(
            request_id="test-id",
            status=StatusEnum.SUCCESS,
            data=SyntheticQAResult(
                qa_pair=QAPair(question="test question", answer="test answer"),
                metadata={},
            ),
            usages=[],
            metadata={"chunkId": "chunk-1"},
            error=None,
        )

        with patch(
            "diting_engine.apis.v1.synthesis.api.synthesizer_service.run_synthesizer",
            return_value=mock_response,
        ):
            response = self.client.post(
                "/api/v1/dataset-synthesis/runs", json=request_data
            )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["metadata"]["chunkId"], "chunk-1")

    def test_run_synthesis_logging(self):
        """Test that synthesis requests are properly logged."""
        request_data = {
            "llmConfig": {"name": "test-model"},
            "synthesizerConfig": {"synthesizerName": "test_synthesizer"},
            "inputData": {"context": ["test context"]},
        }

        mock_response = DatasetSynthesisResponse(
            request_id="test-id",
            status=StatusEnum.SUCCESS,
            data=SyntheticQAResult(
                qa_pair=QAPair(question="test", answer="test"), metadata={}
            ),
            usages=[],
            metadata=None,
            error=None,
        )

        with patch(
            "diting_engine.apis.v1.synthesis.api.synthesizer_service.run_synthesizer",
            return_value=mock_response,
        ) as _mock_service:
            with patch("diting_engine.apis.v1.synthesis.api.logger") as mock_logger:
                response = self.client.post(
                    "/api/v1/dataset-synthesis/runs", json=request_data
                )

        self.assertEqual(response.status_code, 200)

        # Verify logging calls
        self.assertGreaterEqual(
            mock_logger.info.call_count, 2
        )  # Start and completion logs

        # Check that logging calls contain the expected patterns
        call_args_list = [call[0][0] for call in mock_logger.info.call_args_list]
        start_log_found = any(
            "Starting synthesis task, request_id:" in call for call in call_args_list
        )
        completion_log_found = any(
            "Synthesis task completed, request_id:" in call for call in call_args_list
        )

        self.assertTrue(start_log_found, "Starting synthesis task log not found")
        self.assertTrue(completion_log_found, "Synthesis task completed log not found")

    def test_run_synthesis_error_logging(self):
        """Test that synthesis errors are properly logged."""
        request_data = {
            "llmConfig": {"name": "test-model"},
            "synthesizerConfig": {"synthesizerName": "test_synthesizer"},
            "inputData": {"context": ["test context"]},
        }

        with patch(
            "diting_engine.apis.v1.synthesis.api.synthesizer_service.run_synthesizer",
            side_effect=Exception("Service error"),
        ):
            with patch("diting_engine.apis.v1.synthesis.api.logger") as mock_logger:
                response = self.client.post(
                    "/api/v1/dataset-synthesis/runs", json=request_data
                )

        self.assertEqual(response.status_code, 500)

        # Verify error logging
        mock_logger.error.assert_called_once()
        error_call_args = mock_logger.error.call_args[0]
        self.assertIn("Synthesis failed", error_call_args[0])
        self.assertIn("Service error", error_call_args[0])

    def test_run_synthesis_with_synthesizer_config(self):
        """Test synthesis endpoint with synthesizer configuration."""
        request_data = {
            "llmConfig": {"name": "test-model"},
            "synthesizerConfig": {
                "synthesizerName": "test_synthesizer",
                "config": {"temperature": 0.7, "max_tokens": 1000},
            },
            "inputData": {"context": ["test context"]},
        }

        mock_response = DatasetSynthesisResponse(
            request_id="test-id",
            status=StatusEnum.SUCCESS,
            data=SyntheticQAResult(
                qa_pair=QAPair(question="test question", answer="test answer"),
                metadata={},
            ),
            usages=[],
            metadata=None,
            error=None,
        )

        with patch(
            "diting_engine.apis.v1.synthesis.api.synthesizer_service.run_synthesizer",
            return_value=mock_response,
        ):
            response = self.client.post(
                "/api/v1/dataset-synthesis/runs", json=request_data
            )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
