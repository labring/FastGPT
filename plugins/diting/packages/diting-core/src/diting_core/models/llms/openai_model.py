#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import Any, Optional, List, cast

import json_repair
from langchain_core.language_models import BaseLanguageModel
from langchain_core.prompt_values import StringPromptValue, PromptValue
from langchain_core.messages import BaseMessage
from langchain_openai.chat_models import AzureChatOpenAI, ChatOpenAI
from langchain_openai.llms import AzureOpenAI, OpenAI

from diting_core.callbacks.base import ChainType
from diting_core.callbacks.manager import new_group
from diting_core.models.llms.base_model import (
    BaseLLM,
    DictOrPydantic,
    PydanticClass,
)
from diting_core.models.utils import filter_model_output

MULTIPLE_COMPLETION_SUPPORTED = [
    OpenAI,
    ChatOpenAI,
    AzureOpenAI,
    AzureChatOpenAI,
]


class LangchainLLMWrapper(BaseLLM):
    """
    A simple wrapper class for DiTing Large Language Models (LLMs) based on Langchain's
    BaseLanguageModel interface.

    This class provides two main asynchronous methods:
    - `generate`: placeholder for generating text (to be implemented).
    - `generate_structured_output`: generates structured output by invoking the underlying LLM
      with optional support for guided JSON schema or structured output features.

    Attributes:
        llm (BaseLanguageModel[BaseMessage]): The underlying Langchain LLM instance to wrap.
        is_guided_json_support (bool): Indicates if the LLM supports guided JSON schema
            prompting (default: False).
        is_structured_output_support (bool): Indicates if the LLM supports structured output
            interface (default: False).
    """

    def __init__(
        self,
        llm: BaseLanguageModel[BaseMessage],
        is_guided_json_support: bool = False,
    ):
        super().__init__()
        self.llm = llm
        self.is_guided_json_support: bool = is_guided_json_support

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(llm={self.llm.__class__.__name__}(...))"

    @staticmethod
    def get_temperature(n: int) -> float:
        """Return the temperature to use for completion based on n."""
        # return 0.3 if n > 1 else 1e-8
        return 0.3 if n > 1 else 0.0

    @staticmethod
    def is_multiple_completion_supported(llm: BaseLanguageModel[BaseMessage]) -> bool:
        """Return whether the given LLM supports n-completion."""
        for llm_type in MULTIPLE_COMPLETION_SUPPORTED:
            if isinstance(llm, llm_type):
                return True
        return False

    async def generate(
        self,
        prompt: str,
        n: int = 1,
        temperature: Optional[float] = None,
        **kwargs: Any,
    ) -> str | List[str]:
        old_temperature = getattr(self.llm, "temperature", None)
        if temperature is None:
            temperature = self.get_temperature(n=n)
        if hasattr(self.llm, "temperature"):
            self.llm.temperature = temperature  # type: ignore
        prompt_value: PromptValue = StringPromptValue(text=prompt)
        if self.is_multiple_completion_supported(self.llm):
            run_manager, _ = await new_group(
                name=self.__repr__(),
                inputs={"prompt": [prompt]},
                callbacks=kwargs.pop("callbacks", None),
                chain_type=ChainType.LLM,
            )
            result = await self.llm.agenerate_prompt(
                prompts=[prompt_value],
                n=n,
            )
            await run_manager.on_chain_end(
                outputs={"llm_result": result},
                inputs={"prompt": [prompt]},
                chain_type=ChainType.LLM,
            )
        else:
            run_manager, _ = await new_group(
                name=self.__repr__(),
                inputs={"prompt": [prompt] * n},
                callbacks=kwargs.pop("callbacks", None),
                chain_type=ChainType.LLM,
            )
            result = await self.llm.agenerate_prompt(
                prompts=[prompt_value] * n,
            )
            # make LLMResult.generation appear as if it was n_completions
            # note that LLMResult.runs is still a list that represents each run
            generations = [[g[0] for g in result.generations]]
            result.generations = generations
            await run_manager.on_chain_end(
                outputs={"llm_result": result},
                inputs={"prompt": [prompt] * n},
                chain_type=ChainType.LLM,
            )
        # reset the temperature to the original value
        if old_temperature is not None:
            self.llm.temperature = old_temperature  # type: ignore
        if n == 1:
            output_string = result.generations[0][0].text
            return output_string
        else:
            output_strings = [result.generations[0][i].text for i in range(n)]
            return output_strings

    async def _generate_parse(
        self,
        prompt: str,
        schema: Optional[PydanticClass] = None,
        use_guided_json: bool = False,
        **kwargs: Any,
    ) -> Any:
        run_manager, grp_cb = await new_group(
            name=self.__repr__(),
            inputs={"prompt": prompt},
            callbacks=kwargs.pop("callbacks", None),
            verbose=kwargs.pop("verbose", False),
            chain_type=ChainType.LLM,
            schema=schema,
        )
        try:
            if schema is None:
                content = cast(
                    str, await self.generate(prompt, callbacks=grp_cb, **kwargs)
                )
                fmt_output = filter_model_output(content)
                output_model = json_repair.loads(fmt_output)
            elif use_guided_json:
                json_schema = schema.model_json_schema()
                self.llm.extra_body = {"guided_json": json_schema}  # type: ignore
                content = cast(
                    str, await self.generate(prompt, callbacks=grp_cb, **kwargs)
                )
                fmt_output = filter_model_output(content)
                json_output = json_repair.loads(fmt_output)
                output_model = schema.model_validate(json_output)
            else:
                content = cast(
                    str, await self.generate(prompt, callbacks=grp_cb, **kwargs)
                )
                fmt_output = filter_model_output(content)
                json_output = json_repair.loads(fmt_output)
                output_model = schema.model_validate(json_output)
        except Exception as e:
            await run_manager.on_chain_error(e)
            raise e

        await run_manager.on_chain_end(outputs={"llm_output": output_model})
        return output_model

    async def generate_structured_output(
        self,
        prompt: str,
        schema: Optional[PydanticClass] = None,
        **kwargs: Any,
    ) -> DictOrPydantic:
        return await self._generate_parse(
            prompt,
            schema=schema,
            use_guided_json=self.is_guided_json_support,
            **kwargs,
        )
