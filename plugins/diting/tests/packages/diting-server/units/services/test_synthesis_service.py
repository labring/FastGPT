#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import unittest
from unittest.mock import MagicMock, patch
from diting_server.services.synthesis.synthesis_service import SynthesizerService
from diting_server.apis.v1.synthesis.data_models import (
    DatasetSynthesisRequest,
    DatasetSynthesisResponse,
    ModelConfig,
    SynthesizerConfig,
    InputData,
)
from diting_server.exceptions.synthesis import (
    ModelConfigException,
    SynthesizerNotFoundException,
)
from diting_server.common.schema import StatusEnum


class TestSynthesizerService(unittest.IsolatedAsyncioTestCase):
    """Test cases for SynthesizerService class."""

    def setUp(self):
        """Set up test fixtures."""
        self.service = SynthesizerService()

    def test_init(self):
        """Test SynthesizerService initialization."""
        service = SynthesizerService()
        self.assertIsNotNone(service)

    async def test_run_synthesizer_success(self):
        """Test successful synthesis run."""
        # Mock request
        request = DatasetSynthesisRequest(
            llm_config=ModelConfig(name="test-model"),
            synthesizer_config=SynthesizerConfig(synthesizer_name="test_synthesizer"),
            input_data=InputData(context=["test context"]),
        )
        request_id = "test-request-id"

        # Mock the internal synthesis method
        mock_result = {
            "llm_case": MagicMock(
                user_input="test question",
                expected_output="test answer",
                metadata={"test": "metadata"},
            ),
            "usages": [],
            "error": None,
        }

        with patch.object(
            self.service, "_synthesize_case_with_synthesizer", return_value=mock_result
        ):
            response = await self.service.run_synthesizer(request, request_id)

        self.assertIsInstance(response, DatasetSynthesisResponse)
        self.assertEqual(response.request_id, request_id)
        self.assertEqual(response.status, StatusEnum.SUCCESS)
        self.assertIsNotNone(response.data)
        self.assertEqual(response.data.qa_pair.question, "test question")
        self.assertEqual(response.data.qa_pair.answer, "test answer")
        self.assertEqual(response.data.metadata, {"test": "metadata"})
        self.assertIsNone(response.error)

    async def test_run_synthesizer_with_error(self):
        """Test synthesis run with error."""
        # Mock request
        request = DatasetSynthesisRequest(
            llm_config=ModelConfig(name="test-model"),
            synthesizer_config=SynthesizerConfig(synthesizer_name="test_synthesizer"),
            input_data=InputData(context=["test context"]),
        )
        request_id = "test-request-id"

        # Mock the internal synthesis method with error
        mock_result = {
            "llm_case": None,
            "usages": [],
            "error": "Test synthesis error occurred",
        }

        with patch.object(
            self.service, "_synthesize_case_with_synthesizer", return_value=mock_result
        ):
            response = await self.service.run_synthesizer(request, request_id)

        self.assertIsInstance(response, DatasetSynthesisResponse)
        self.assertEqual(response.request_id, request_id)
        self.assertEqual(response.status, StatusEnum.FAILED)
        self.assertIsNotNone(response.data)
        self.assertEqual(response.data.qa_pair.question, "")
        self.assertEqual(response.data.qa_pair.answer, "")
        self.assertEqual(response.data.metadata, {})
        self.assertEqual(response.error, "Test synthesis error occurred")

    async def test_run_synthesizer_model_config_exception(self):
        """Test synthesis run with model config exception."""
        # Mock request
        request = DatasetSynthesisRequest(
            llm_config=ModelConfig(name="test-model"),
            synthesizer_config=SynthesizerConfig(synthesizer_name="test_synthesizer"),
            input_data=InputData(context=["test context"]),
        )
        request_id = "test-request-id"

        # Mock the internal synthesis method to raise exception
        with patch.object(
            self.service,
            "_synthesize_case_with_synthesizer",
            side_effect=ModelConfigException("Model config error"),
        ):
            with self.assertRaises(ModelConfigException):
                await self.service.run_synthesizer(request, request_id)

    async def test_run_synthesizer_synthesizer_not_found_exception(self):
        """Test synthesis run with synthesizer not found exception."""
        # Mock request
        request = DatasetSynthesisRequest(
            llm_config=ModelConfig(name="test-model"),
            synthesizer_config=SynthesizerConfig(synthesizer_name="test_synthesizer"),
            input_data=InputData(context=["test context"]),
        )
        request_id = "test-request-id"

        # Mock the internal synthesis method to raise exception
        with patch.object(
            self.service,
            "_synthesize_case_with_synthesizer",
            side_effect=SynthesizerNotFoundException("Synthesizer not found"),
        ):
            with self.assertRaises(SynthesizerNotFoundException):
                await self.service.run_synthesizer(request, request_id)

    def test_load_synthesizer(self):
        """Test loading synthesizer from factory."""
        # Mock synthesizer factory
        mock_synthesizer_class = MagicMock()

        with patch(
            "diting_server.services.synthesis.synthesis_service.SynthesizerFactory"
        ) as mock_factory_class:
            mock_factory = mock_factory_class.return_value
            mock_factory.create.return_value = mock_synthesizer_class

            with patch.object(
                self.service, "_load_synthesizer", return_value=mock_synthesizer_class
            ):
                result = self.service._load_synthesizer("test_synthesizer")

        self.assertEqual(result, mock_synthesizer_class)

    async def test_run_synthesizer_with_none_llm_case(self):
        """Test run_synthesizer when _synthesize_case_with_synthesizer returns None for llm_case."""
        # Mock request
        request = DatasetSynthesisRequest(
            llm_config=ModelConfig(name="test-model"),
            synthesizer_config=SynthesizerConfig(synthesizer_name="test_synthesizer"),
            input_data=InputData(context=["test context"]),
        )
        request_id = "test-request-id"

        # Mock the internal synthesis method to return None for llm_case
        mock_result = {"llm_case": None, "usages": [], "error": "Synthesis failed"}

        with patch.object(
            self.service, "_synthesize_case_with_synthesizer", return_value=mock_result
        ):
            response = await self.service.run_synthesizer(request, request_id)

        self.assertIsInstance(response, DatasetSynthesisResponse)
        self.assertEqual(response.request_id, request_id)
        self.assertEqual(response.status, StatusEnum.FAILED)
        self.assertIsNotNone(response.data)
        self.assertEqual(response.data.qa_pair.question, "")
        self.assertEqual(response.data.qa_pair.answer, "")
        self.assertEqual(response.data.metadata, {})
        self.assertEqual(response.error, "Synthesis failed")
