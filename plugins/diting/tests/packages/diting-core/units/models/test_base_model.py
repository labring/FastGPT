import typing as t
import unittest
from diting_core.models.llms.base_model import (
    BaseLLM,
    DictOrPydanticClass,
    DictOrPydantic,
)
from typing import Any, Dict, Tuple


class MockLLM(BaseLLM):
    async def generate(self, *args: Tuple[Any], **kwargs: Dict[str, Any]) -> str:
        return "Generated Response"

    async def generate_structured_output(
        self,
        prompt: str,
        schema: t.Optional[DictOrPydanticClass] = None,
        **kwargs: t.Any,
    ) -> DictOrPydantic:
        return {"testkey": "testval"}


class TestBaseLLM(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.model = MockLLM()

    async def test_generate(self):
        result = await self.model.generate()
        self.assertEqual(result, "Generated Response")

    async def test_generate_structured_output(self):
        result = await self.model.generate_structured_output(
            "Generated Structured Response"
        )
        self.assertEqual(result, {"testkey": "testval"})


if __name__ == "__main__":
    unittest.main()
