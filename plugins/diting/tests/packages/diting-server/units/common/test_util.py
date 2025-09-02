#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import unittest
from unittest.mock import patch, MagicMock
from diting_server.common.utils import compute_token_usage, resolve_model_config
from diting_server.common.schema import ModelType


class TestComputeTokenUsage(unittest.TestCase):
    """Test cases for compute_token_usage function."""

    def test_compute_token_usage_empty_lists(self):
        """Test compute_token_usage with empty lists."""
        result = compute_token_usage([], [])
        self.assertEqual(result, [])

    def test_compute_token_usage_embed_only(self):
        """Test compute_token_usage with embedding usage only."""
        # Mock embedding usage objects
        embed_usage1 = MagicMock()
        embed_usage1.prompt_tokens = 100
        embed_usage1.completion_tokens = 0
        embed_usage1.total_tokens = 100

        embed_usage2 = MagicMock()
        embed_usage2.prompt_tokens = 50
        embed_usage2.completion_tokens = 0
        embed_usage2.total_tokens = 50

        embed_usages = [embed_usage1, embed_usage2]
        llm_usages = []

        result = compute_token_usage(llm_usages, embed_usages)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].model_type, ModelType.EMBED)
        self.assertEqual(result[0].prompt_tokens, 150)  # 100 + 50
        self.assertEqual(result[0].completion_tokens, 0)
        self.assertEqual(result[0].total_tokens, 150)  # 100 + 50

    def test_compute_token_usage_llm_only(self):
        """Test compute_token_usage with LLM usage only."""
        llm_usages = [
            {"prompt_tokens": 200, "completion_tokens": 100, "total_tokens": 300},
            {"prompt_tokens": 150, "completion_tokens": 75, "total_tokens": 225},
        ]
        embed_usages = []

        result = compute_token_usage(llm_usages, embed_usages)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].model_type, ModelType.LLM)
        self.assertEqual(result[0].prompt_tokens, 350)  # 200 + 150
        self.assertEqual(result[0].completion_tokens, 175)  # 100 + 75
        self.assertEqual(result[0].total_tokens, 525)  # 300 + 225

    def test_compute_token_usage_both_types(self):
        """Test compute_token_usage with both LLM and embedding usage."""
        # Mock embedding usage
        embed_usage = MagicMock()
        embed_usage.prompt_tokens = 100
        embed_usage.completion_tokens = 0
        embed_usage.total_tokens = 100

        llm_usages = [
            {"prompt_tokens": 200, "completion_tokens": 100, "total_tokens": 300}
        ]
        embed_usages = [embed_usage]

        result = compute_token_usage(llm_usages, embed_usages)

        self.assertEqual(len(result), 2)

        # Check embedding usage
        embed_result = next(r for r in result if r.model_type == ModelType.EMBED)
        self.assertEqual(embed_result.prompt_tokens, 100)
        self.assertEqual(embed_result.completion_tokens, 0)
        self.assertEqual(embed_result.total_tokens, 100)

        # Check LLM usage
        llm_result = next(r for r in result if r.model_type == ModelType.LLM)
        self.assertEqual(llm_result.prompt_tokens, 200)
        self.assertEqual(llm_result.completion_tokens, 100)
        self.assertEqual(llm_result.total_tokens, 300)

    def test_compute_token_usage_missing_completion_tokens(self):
        """Test compute_token_usage with missing completion_tokens in LLM usage."""
        llm_usages = [
            {"prompt_tokens": 200, "total_tokens": 200},  # Missing completion_tokens
            {"prompt_tokens": 150, "completion_tokens": 75, "total_tokens": 225},
        ]
        embed_usages = []

        result = compute_token_usage(llm_usages, embed_usages)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].model_type, ModelType.LLM)
        self.assertEqual(result[0].prompt_tokens, 350)  # 200 + 150
        self.assertEqual(
            result[0].completion_tokens, 75
        )  # 0 + 75 (missing treated as 0)
        self.assertEqual(result[0].total_tokens, 425)  # 200 + 225

    def test_compute_token_usage_zero_values(self):
        """Test compute_token_usage with zero values."""
        llm_usages = [{"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}]
        embed_usages = []

        result = compute_token_usage(llm_usages, embed_usages)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].model_type, ModelType.LLM)
        self.assertEqual(result[0].prompt_tokens, 0)
        self.assertEqual(result[0].completion_tokens, 0)
        self.assertEqual(result[0].total_tokens, 0)


class TestResolveModelConfig(unittest.TestCase):
    """Test cases for resolve_model_config function."""

    def test_resolve_model_config_with_all_params(self):
        """Test resolve_model_config with all parameters provided."""
        result = resolve_model_config(
            model="test-model", base_url="https://api.example.com", api_key="test-key"
        )

        expected = {
            "model": "test-model",
            "base_url": "https://api.example.com",
            "api_key": "test-key",
        }
        self.assertEqual(result, expected)

    def test_resolve_model_config_with_none_params(self):
        """Test resolve_model_config with None parameters."""
        with patch.dict(
            "os.environ",
            {
                "AIPROXY_API_ENDPOIN": "https://default.example.com",
                "AIPROXY_API_TOKEN": "default-token",
            },
        ):
            result = resolve_model_config(
                model="test-model", base_url=None, api_key=None
            )

            expected = {
                "model": "test-model",
                "base_url": "https://default.example.com",
                "api_key": "default-token",
            }
            self.assertEqual(result, expected)

    def test_resolve_model_config_with_partial_params(self):
        """Test resolve_model_config with partial parameters."""
        with patch.dict(
            "os.environ",
            {
                "AIPROXY_API_ENDPOIN": "https://default.example.com",
                "AIPROXY_API_TOKEN": "default-token",
            },
        ):
            result = resolve_model_config(
                model="test-model", base_url="https://custom.example.com", api_key=None
            )

            expected = {
                "model": "test-model",
                "base_url": "https://custom.example.com",
                "api_key": None,
            }
            self.assertEqual(result, expected)

    def test_resolve_model_config_url_with_v1_path(self):
        """Test resolve_model_config with URL containing /v1 path."""
        result = resolve_model_config(
            model="test-model",
            base_url="https://api.example.com/v1",
            api_key="test-key",
        )

        expected = {
            "model": "test-model",
            "base_url": "https://api.example.com/v1",
            "api_key": "test-key",
        }
        self.assertEqual(result, expected)

    def test_resolve_model_config_url_with_custom_path(self):
        """Test resolve_model_config with URL containing custom path."""
        result = resolve_model_config(
            model="test-model",
            base_url="https://api.example.com/custom/path",
            api_key="test-key",
        )

        expected = {
            "model": "test-model",
            "base_url": "https://api.example.com/custom/path/v1",
            "api_key": "test-key",
        }
        self.assertEqual(result, expected)

    def test_resolve_model_config_url_with_v1_in_path(self):
        """Test resolve_model_config with URL containing /v1 in the middle of path."""
        result = resolve_model_config(
            model="test-model",
            base_url="https://api.example.com/custom/v1/endpoint",
            api_key="test-key",
        )

        expected = {
            "model": "test-model",
            "base_url": "https://api.example.com/v1",
            "api_key": "test-key",
        }
        self.assertEqual(result, expected)

    def test_resolve_model_config_url_with_trailing_slash(self):
        """Test resolve_model_config with URL having trailing slash."""
        result = resolve_model_config(
            model="test-model",
            base_url="https://api.example.com/custom/",
            api_key="test-key",
        )

        expected = {
            "model": "test-model",
            "base_url": "https://api.example.com/custom/v1",
            "api_key": "test-key",
        }
        self.assertEqual(result, expected)

    def test_resolve_model_config_no_environment_variables(self):
        """Test resolve_model_config when no environment variables are set."""
        with patch.dict("os.environ", {}, clear=True):
            result = resolve_model_config(
                model="test-model", base_url=None, api_key=None
            )

            expected = {"model": "test-model", "base_url": None, "api_key": None}
            self.assertEqual(result, expected)

    def test_resolve_model_config_minimal_params(self):
        """Test resolve_model_config with minimal parameters."""
        result = resolve_model_config(model="test-model")

        expected = {"model": "test-model", "base_url": None, "api_key": None}
        self.assertEqual(result, expected)
