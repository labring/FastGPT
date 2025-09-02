#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import unittest
from unittest.mock import MagicMock, patch
from uuid import uuid4
from diting_server.common.callback import (
    count_tokens,
    BaseTokenCallbackHandler,
    GetEmbedTokenCallbackHandler,
    GetLLMTokenCallbackHandler,
)
from diting_server.common.schema import ModelType
from diting_core.callbacks.base import ChainType


class TestCountTokens(unittest.TestCase):
    """Test cases for count_tokens function."""

    def test_count_tokens_string(self):
        """Test count_tokens with string input."""
        text = "Hello world"
        result = count_tokens(text)
        self.assertIsInstance(result, int)
        self.assertGreater(result, 0)

    def test_count_tokens_list(self):
        """Test count_tokens with list input."""
        texts = ["Hello", "world", "test"]
        result = count_tokens(texts)
        self.assertIsInstance(result, int)
        self.assertGreater(result, 0)

    def test_count_tokens_empty_string(self):
        """Test count_tokens with empty string."""
        result = count_tokens("")
        self.assertEqual(result, 0)

    def test_count_tokens_empty_list(self):
        """Test count_tokens with empty list."""
        result = count_tokens([])
        self.assertEqual(result, 0)

    def test_count_tokens_unicode(self):
        """Test count_tokens with unicode text."""
        text = "你好世界"
        result = count_tokens(text)
        self.assertIsInstance(result, int)
        self.assertGreater(result, 0)

    def test_count_tokens_invalid_type(self):
        """Test count_tokens with invalid input type."""
        with self.assertRaises(ValueError):
            count_tokens(123)

    def test_count_tokens_mixed_list(self):
        """Test count_tokens with mixed content list."""
        texts = ["Hello", "世界", "test"]
        result = count_tokens(texts)
        self.assertIsInstance(result, int)
        self.assertGreater(result, 0)


class TestBaseTokenCallbackHandler(unittest.TestCase):
    """Test cases for BaseTokenCallbackHandler class."""

    def test_init(self):
        """Test BaseTokenCallbackHandler initialization."""
        handler = BaseTokenCallbackHandler()
        self.assertEqual(handler.usages, [])

    def test_append_usage_llm(self):
        """Test _append_usage with LLM model type."""
        handler = BaseTokenCallbackHandler()
        handler._append_usage(ModelType.LLM, 100, 50)

        self.assertEqual(len(handler.usages), 1)
        usage = handler.usages[0]
        self.assertEqual(usage.model_type, ModelType.LLM)
        self.assertEqual(usage.prompt_tokens, 100)
        self.assertEqual(usage.completion_tokens, 50)
        self.assertEqual(usage.total_tokens, 150)

    def test_append_usage_embed(self):
        """Test _append_usage with embedding model type."""
        handler = BaseTokenCallbackHandler()
        handler._append_usage(ModelType.EMBED, 200)

        self.assertEqual(len(handler.usages), 1)
        usage = handler.usages[0]
        self.assertEqual(usage.model_type, ModelType.EMBED)
        self.assertEqual(usage.prompt_tokens, 200)
        self.assertEqual(usage.completion_tokens, 0)
        self.assertEqual(usage.total_tokens, 200)

    def test_append_usage_multiple(self):
        """Test _append_usage with multiple usages."""
        handler = BaseTokenCallbackHandler()
        handler._append_usage(ModelType.LLM, 100, 50)
        handler._append_usage(ModelType.EMBED, 200)

        self.assertEqual(len(handler.usages), 2)
        self.assertEqual(handler.usages[0].model_type, ModelType.LLM)
        self.assertEqual(handler.usages[1].model_type, ModelType.EMBED)


class TestGetEmbedTokenCallbackHandler(unittest.IsolatedAsyncioTestCase):
    """Test cases for GetEmbedTokenCallbackHandler class."""

    def test_init(self):
        """Test GetEmbedTokenCallbackHandler initialization."""
        handler = GetEmbedTokenCallbackHandler()
        self.assertEqual(handler.usages, [])

    async def test_on_chain_end_embed_chain_with_usage(self):
        """Test on_chain_end with embed chain type and usage in result."""
        handler = GetEmbedTokenCallbackHandler()

        # Mock usage object
        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 100
        mock_usage.completion_tokens = 0
        mock_usage.total_tokens = 100

        # Mock embed result with usage
        mock_result = MagicMock()
        mock_result.usage = mock_usage

        outputs = {"result": mock_result}
        run_id = uuid4()

        await handler.on_chain_end(
            outputs=outputs, run_id=run_id, chain_type=ChainType.EMBED
        )

        self.assertEqual(len(handler.usages), 1)
        self.assertEqual(handler.usages[0], mock_usage)

    async def test_on_chain_end_embed_chain_without_usage(self):
        """Test on_chain_end with embed chain type but no usage in result."""
        handler = GetEmbedTokenCallbackHandler()

        # Mock embed result without usage
        mock_result = MagicMock()
        mock_result.usage = None

        outputs = {"result": mock_result}
        inputs = {"embed_input": "test input"}
        run_id = uuid4()

        with patch("diting_engine.common.callback.count_tokens", return_value=10):
            await handler.on_chain_end(
                outputs=outputs,
                run_id=run_id,
                chain_type=ChainType.EMBED,
                inputs=inputs,
            )

        self.assertEqual(len(handler.usages), 1)
        usage = handler.usages[0]
        self.assertEqual(usage.model_type, ModelType.EMBED)
        self.assertEqual(usage.prompt_tokens, 10)
        self.assertEqual(usage.completion_tokens, 0)
        self.assertEqual(usage.total_tokens, 10)

    async def test_on_chain_end_non_embed_chain(self):
        """Test on_chain_end with non-embed chain type."""
        handler = GetEmbedTokenCallbackHandler()

        outputs = {"result": MagicMock()}
        run_id = uuid4()

        await handler.on_chain_end(
            outputs=outputs,
            run_id=run_id,
            chain_type=ChainType.LLM,  # Different chain type
        )

        self.assertEqual(len(handler.usages), 0)

    async def test_on_chain_end_no_result(self):
        """Test on_chain_end with no result in outputs."""
        handler = GetEmbedTokenCallbackHandler()

        outputs = {}
        inputs = {"embed_input": "test input"}
        run_id = uuid4()

        with patch("diting_engine.common.callback.count_tokens", return_value=5):
            await handler.on_chain_end(
                outputs=outputs,
                run_id=run_id,
                chain_type=ChainType.EMBED,
                inputs=inputs,
            )

        self.assertEqual(len(handler.usages), 1)
        usage = handler.usages[0]
        self.assertEqual(usage.model_type, ModelType.EMBED)
        self.assertEqual(usage.prompt_tokens, 5)


class TestGetLLMTokenCallbackHandler(unittest.IsolatedAsyncioTestCase):
    """Test cases for GetLLMTokenCallbackHandler class."""

    def test_init(self):
        """Test GetLLMTokenCallbackHandler initialization."""
        handler = GetLLMTokenCallbackHandler()
        self.assertEqual(handler.usages, [])

    async def test_on_chain_end_llm_chain_with_token_usage(self):
        """Test on_chain_end with LLM chain type and token_usage in llm_output."""
        handler = GetLLMTokenCallbackHandler()

        # Mock token usage
        mock_token_usage = {
            "prompt_tokens": 100,
            "completion_tokens": 50,
            "total_tokens": 150,
        }

        # Mock LLM result with token usage
        mock_llm_output = {"token_usage": mock_token_usage}
        mock_llm_result = MagicMock()
        mock_llm_result.llm_output = mock_llm_output

        outputs = {"llm_result": mock_llm_result}
        run_id = uuid4()

        await handler.on_chain_end(
            outputs=outputs, run_id=run_id, chain_type=ChainType.LLM
        )

        self.assertEqual(len(handler.usages), 1)
        self.assertEqual(handler.usages[0], mock_token_usage)

    async def test_on_chain_end_llm_chain_without_token_usage(self):
        """Test on_chain_end with LLM chain type but no token_usage."""
        handler = GetLLMTokenCallbackHandler()

        # Mock LLM result without token usage
        mock_llm_output = {}
        mock_llm_result = MagicMock()
        mock_llm_result.llm_output = mock_llm_output

        # Mock generations
        mock_generation = MagicMock()
        mock_generation.text = "test response"
        mock_llm_result.generations = [[mock_generation]]

        outputs = {"llm_result": mock_llm_result}
        inputs = {"prompt": "test prompt"}
        run_id = uuid4()

        with patch("diting_engine.common.callback.count_tokens", side_effect=[10, 5]):
            await handler.on_chain_end(
                outputs=outputs, run_id=run_id, chain_type=ChainType.LLM, inputs=inputs
            )

        self.assertEqual(len(handler.usages), 1)
        usage = handler.usages[0]
        self.assertEqual(usage.model_type, ModelType.LLM)
        self.assertEqual(usage.prompt_tokens, 10)
        self.assertEqual(usage.completion_tokens, 5)
        self.assertEqual(usage.total_tokens, 15)

    async def test_on_chain_end_non_llm_chain(self):
        """Test on_chain_end with non-LLM chain type."""
        handler = GetLLMTokenCallbackHandler()

        outputs = {"llm_result": MagicMock()}
        run_id = uuid4()

        await handler.on_chain_end(
            outputs=outputs,
            run_id=run_id,
            chain_type=ChainType.EMBED,  # Different chain type
        )

        self.assertEqual(len(handler.usages), 0)

    async def test_on_chain_end_no_llm_result(self):
        """Test on_chain_end with no llm_result in outputs."""
        handler = GetLLMTokenCallbackHandler()

        # Mock llm_result with generations but no token_usage
        mock_llm_output = {}
        mock_llm_result = MagicMock()
        mock_llm_result.llm_output = mock_llm_output

        # Mock generations
        mock_generation = MagicMock()
        mock_generation.text = "test response"
        mock_llm_result.generations = [[mock_generation]]

        outputs = {"llm_result": mock_llm_result}
        inputs = {"prompt": "test prompt"}
        run_id = uuid4()

        with patch("diting_engine.common.callback.count_tokens", side_effect=[8, 8]):
            await handler.on_chain_end(
                outputs=outputs, run_id=run_id, chain_type=ChainType.LLM, inputs=inputs
            )

        self.assertEqual(len(handler.usages), 1)
        usage = handler.usages[0]
        self.assertEqual(usage.model_type, ModelType.LLM)
        self.assertEqual(usage.prompt_tokens, 8)
        self.assertEqual(usage.completion_tokens, 8)
        self.assertEqual(usage.total_tokens, 16)

    async def test_on_chain_end_no_prompt_in_inputs(self):
        """Test on_chain_end with no prompt in inputs."""
        handler = GetLLMTokenCallbackHandler()

        # Mock llm_result with generations but no token_usage
        mock_llm_output = {}
        mock_llm_result = MagicMock()
        mock_llm_result.llm_output = mock_llm_output

        # Mock generations
        mock_generation = MagicMock()
        mock_generation.text = "test response"
        mock_llm_result.generations = [[mock_generation]]

        outputs = {"llm_result": mock_llm_result}
        inputs = {}
        run_id = uuid4()

        with patch("diting_engine.common.callback.count_tokens", return_value=3):
            await handler.on_chain_end(
                outputs=outputs, run_id=run_id, chain_type=ChainType.LLM, inputs=inputs
            )

        self.assertEqual(len(handler.usages), 1)
        usage = handler.usages[0]
        self.assertEqual(usage.model_type, ModelType.LLM)
        self.assertEqual(usage.prompt_tokens, 0)  # No prompt provided
        self.assertEqual(usage.completion_tokens, 3)
        self.assertEqual(usage.total_tokens, 3)
