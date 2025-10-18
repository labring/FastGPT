#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import Optional, Any
from langchain_openai import ChatOpenAI

from diting_core.models.llms.base_model import BaseLLM
from pydantic import SecretStr
from diting_core.models.llms.openai_model import LangchainLLMWrapper


def llm_factory(
    model: str = "gpt-4o-mini",
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    timeout: Optional[float] = None,
    is_guided_json_support: bool = False,
    **kwargs: Any,
) -> BaseLLM:
    # 统一设置 enable_thinking 为 false 以避免非流式调用错误
    extra_body = kwargs.get("extra_body", {})
    extra_body["enable_thinking"] = False
    kwargs["extra_body"] = extra_body

    if api_key:
        llm = ChatOpenAI(
            model=model,
            base_url=base_url,
            api_key=SecretStr(api_key),
            timeout=timeout,
            **kwargs,
        )
    else:
        llm = ChatOpenAI(model=model, base_url=base_url, timeout=timeout, **kwargs)
    return LangchainLLMWrapper(
        llm=llm,
        is_guided_json_support=is_guided_json_support,
    )
