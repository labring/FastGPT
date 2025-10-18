#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import asyncio
import json_repair
from typing import Any, Dict, Callable, Awaitable, TypeVar, Type
from pydantic import BaseModel, ValidationError
import logging

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class JsonRetryHandler:
    def __init__(
        self,
        max_retries: int = 3,
        retry_delay: float = 1.0,
    ):
        self.max_retries = max_retries
        self.retry_delay = retry_delay

    async def generate_and_validate(
        self,
        generate_func: Callable[[str], Awaitable[str]],
        schema: Type[T],
        enhance_prompt_func: Callable[[str, Dict[str, Any]], str],
        original_prompt: str,
    ) -> T:
        current_prompt = original_prompt
        last_exception = None

        for attempt in range(self.max_retries + 1):
            try:
                content = await generate_func(current_prompt)

                from diting_core.models.utils import filter_model_output

                fmt_output = filter_model_output(content)
                json_output = json_repair.loads(fmt_output)
                validated_model = schema.model_validate(json_output)

                return validated_model

            except Exception as e:
                last_exception = e
                logger.warning(f"Generation attempt {attempt + 1} failed: {e}")

                if attempt < self.max_retries:
                    error_info = self._create_error_info(e, schema)
                    current_prompt = enhance_prompt_func(original_prompt, error_info)
                    await asyncio.sleep(self.retry_delay)

        raise last_exception or Exception("All retry attempts failed")

    def _create_error_info(
        self, exception: Exception, schema: Type[BaseModel]
    ) -> Dict[str, Any]:
        error_info: dict[str, Any] = {
            "error_type": type(exception).__name__,
            "error_message": str(exception),
        }

        if isinstance(exception, ValidationError):
            validation_errors: list[Dict[str, Any]] = []
            for error in exception.errors():
                validation_errors.append(
                    {
                        "field": error.get("loc", ()),
                        "type": error.get("type", ""),
                        "message": error.get("msg", ""),
                    }
                )
            error_info["validation_errors"] = validation_errors

        return error_info


def create_enhanced_prompt(original_prompt: str, error_info: Dict[str, Any]) -> str:
    error_msg = error_info["error_message"]
    error_details: list[str] = []
    if "validation_errors" in error_info:
        for val_error in error_info["validation_errors"]:
            field_path = ".".join(str(loc) for loc in val_error["field"])
            error_details.append(f"- 字段 '{field_path}': {val_error['message']}")

    error_detail_str = "\n".join(error_details) if error_details else f"- {error_msg}"

    enhanced_prompt = f"""{original_prompt}

**重要提醒：上次生成的JSON有问题，请修正以下错误：**

{error_detail_str}

请确保：
1. 生成有效的JSON格式
2. 包含所有必需字段
3. 字段类型正确
4. 遵循准确的数据结构

请重新生成正确的JSON："""

    return enhanced_prompt
