import unittest
from unittest.mock import AsyncMock, patch

from langchain_core.language_models import BaseLanguageModel
from langchain_core.messages import BaseMessage
from langchain_core.outputs import LLMResult
from langchain_core.outputs.chat_generation import ChatGeneration
from langchain_core.messages.ai import AIMessage
from langchain_openai.chat_models import ChatOpenAI
from pydantic import BaseModel
from diting_core.models.llms.openai_model import LangchainLLMWrapper


class TestLangchainLLMWrapper(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mock_llm = AsyncMock(spec=BaseLanguageModel[BaseMessage])
        self.wrapper = LangchainLLMWrapper(
            llm=self.mock_llm,
            is_guided_json_support=True,
        )

    def test_is_multiple_completion_supported(self):
        llm = ChatOpenAI(model="test", base_url="test", api_key="test")
        result = self.wrapper.is_multiple_completion_supported(llm)
        self.assertEqual(result, True)

    @staticmethod
    def mock_model_output() -> LLMResult:
        generations = [
            [
                ChatGeneration(
                    text="你好！我是Qwen，由阿里云开发的超大规模语言模型。我被设计用来生成各种文本，如文章、故事、诗歌、故事等，并能回答问题、提供信息和与用户进行对话。很高兴认识你！有什么我可以帮助你的吗？",
                    generation_info={"finish_reason": "stop", "logprobs": None},
                    message=AIMessage(
                        content="你好！我是Qwen，由阿里云开发的超大规模语言模型。我被设计用来生成各种文本，如文章、故事、诗歌、故事等，并能回答问题、提供信息和与用户进行对话。很高兴认识你！有什么我可以帮助你的吗？",
                        additional_kwargs={"refusal": None},
                        response_metadata={"finish_reason": "stop", "logprobs": None},
                        id="run--70680bb2-832b-40df-91e6-445fbb3b4e0a-0",
                        usage_metadata={
                            "input_tokens": 33,
                            "output_tokens": 113,
                            "total_tokens": 146,
                            "input_token_details": {},
                            "output_token_details": {},
                        },
                    ),
                ),
                ChatGeneration(
                    text="你好！我是Qwen，由阿里云开发的大规模语言模型。我被设计用来生成各种文本，如文章、故事、诗歌、故事等，也能回答问题、提供信息和与用户进行对话。很高兴认识你！有什么我可以帮助你的吗？",
                    generation_info={"finish_reason": "stop", "logprobs": None},
                    message=AIMessage(
                        content="你好！我是Qwen，由阿里云开发的大规模语言模型。我被设计用来生成各种文本，如文章、故事、诗歌、故事等，也能回答问题、提供信息和与用户进行对话。很高兴认识你！有什么我可以帮助你的吗？",
                        additional_kwargs={},
                        response_metadata={"finish_reason": "stop", "logprobs": None},
                        id="run--70680bb2-832b-40df-91e6-445fbb3b4e0a-1",
                        usage_metadata={
                            "input_tokens": 33,
                            "output_tokens": 113,
                            "total_tokens": 146,
                            "input_token_details": {},
                            "output_token_details": {},
                        },
                    ),
                ),
            ]
        ]
        return LLMResult(generations=generations)

    @patch("diting_core.models.utils.filter_model_output")
    @patch("json_repair.loads")
    async def test_generate_parse_without_schema(
        self, mock_json_repair, mock_filter_output
    ):
        self.wrapper.generate = AsyncMock(return_value='{"key": "value"}')
        mock_filter_output.return_value = '{"key": "value"}'
        mock_json_repair.return_value = {"key": "value"}

        result = await self.wrapper._generate_parse("Some prompt")

        self.assertEqual(result, {"key": "value"})

    @patch("diting_core.models.utils.filter_model_output")
    @patch("json_repair.loads")
    async def test_generate_parse_guided_json(
        self, mock_json_repair, mock_filter_output
    ):
        self.wrapper.generate = AsyncMock(return_value='{"key": "value"}')
        mock_filter_output.return_value = '{"key": "value"}'
        mock_json_repair.return_value = {"key": "value"}

        class Schema(BaseModel):
            key: str

        result = await self.wrapper._generate_parse(
            "Prompt", schema=Schema, use_guided_json=True
        )

        self.assertEqual(result, Schema(key="value"))

    async def test_generate_parse_without_structure_and_guided_json(self):
        with patch.object(
            self.wrapper,
            "is_multiple_completion_supported",
            AsyncMock(return_value=True),
        ):
            self.wrapper.is_guided_json_support = False
            self.wrapper.is_structured_output_support = False
            self.wrapper.generate = AsyncMock(return_value='{"key": "value"}')

            class Schema(BaseModel):
                key: str

            result = await self.wrapper.generate_structured_output(
                "Structured Prompt", schema=Schema
            )

            self.assertEqual(result, Schema(key="value"))

    async def test_generate_without_temperature(self):
        model_output = self.mock_model_output()
        mock_llm = AsyncMock()
        mock_llm.agenerate_prompt.return_value = model_output
        self.wrapper.llm = mock_llm
        result = await self.wrapper.generate("你好")
        self.assertIsInstance(result, str)

    async def test_generate_with_temperature(self):
        model_output = self.mock_model_output()
        mock_llm = AsyncMock()
        mock_llm.temperature = 0.1
        mock_llm.agenerate_prompt.return_value = model_output
        self.wrapper.llm = mock_llm
        result = await self.wrapper.generate("你好")
        self.assertIsInstance(result, str)
