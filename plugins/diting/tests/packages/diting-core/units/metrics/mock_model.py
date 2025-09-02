#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import typing as t

from diting_core.models.llms.base_model import (
    BaseLLM,
)


class MockLLM(BaseLLM):
    async def generate(
        self, *args: t.Tuple[t.Any], **kwargs: t.Dict[str, t.Any]
    ) -> str:
        return "Generated Response"

    async def generate_structured_output(
        self,
        prompt: str,
        **kwargs: t.Any,
    ) -> t.Dict[str, t.Any]:
        return {"testkey": "testval"}
