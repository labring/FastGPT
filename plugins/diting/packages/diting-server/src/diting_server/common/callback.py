import os
from typing import Any, Dict, Optional, Union, List
from uuid import UUID


from typing_extensions import override
from diting_core.callbacks.base import AsyncCallbackHandler
from diting_core.callbacks.base import ChainType
from diting_server.common.schema import Usage, ModelType

os.environ.setdefault(
    "TIKTOKEN_CACHE_DIR",
    os.path.dirname(os.path.abspath(__file__)) + "/tokenizer",
)
import tiktoken

ENC = tiktoken.get_encoding("cl100k_base")


def count_tokens(input_text: Union[str, List[str]]) -> int:
    if isinstance(input_text, str):
        texts = [input_text]
    elif isinstance(input_text, list):
        texts = input_text
    else:
        raise ValueError(f"Unsupported input type: {type(input_text)}")

    return sum(len(ENC.encode(text)) for text in texts)


class BaseTokenCallbackHandler(AsyncCallbackHandler):
    """
    提供基础的 token 统计方法
    """

    def __init__(self):
        self.usages: list[Any] = []

    def _append_usage(
        self, model_type: ModelType, prompt_tokens: int, completion_tokens: int = 0
    ):
        total_tokens = prompt_tokens + completion_tokens
        usage = Usage(
            model_type=model_type,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
        )
        self.usages.append(usage)


class GetEmbedTokenCallbackHandler(BaseTokenCallbackHandler):
    @override
    async def on_chain_end(
        self,
        outputs: Dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> None:
        chain_type = kwargs.pop("chain_type", None)
        if chain_type != ChainType.EMBED:
            return

        embed_result = outputs.get("result")
        if embed_result and getattr(embed_result, "usage", None):
            self.usages.append(embed_result.usage)
        else:
            chain_input = kwargs.pop("inputs", None)
            embed_input = chain_input.get("embed_input") if chain_input else None
            if embed_input is not None:
                prompt_tokens = count_tokens(embed_input)
                self._append_usage(ModelType.EMBED, prompt_tokens)


class GetLLMTokenCallbackHandler(BaseTokenCallbackHandler):
    @override
    async def on_chain_end(
        self,
        outputs: Dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> None:
        chain_type = kwargs.pop("chain_type", None)
        if chain_type != ChainType.LLM:
            return

        llm_result = outputs.get("llm_result")
        token_usage = (
            llm_result.llm_output.get("token_usage")
            if llm_result and getattr(llm_result, "llm_output", None)
            else None
        )
        if token_usage:
            self.usages.append(token_usage)
        else:
            chain_input = kwargs.pop("inputs", None)
            prompt = chain_input.get("prompt") if chain_input else None
            prompt_tokens = 0
            if prompt:
                prompt_tokens = count_tokens(prompt)
            llm_result = outputs.get("llm_result")
            generations = llm_result.generations  # type: ignore
            chat_generation = [
                chat_generation.text for chat_generation in generations[0]
            ]
            completion_tokens = count_tokens(chat_generation)
            self._append_usage(ModelType.LLM, prompt_tokens, completion_tokens)
