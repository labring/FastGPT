#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import unittest
from typing import Any
from unittest.mock import AsyncMock
from diting_core.synthesis.base_corpus import (
    BaseCorpus,
    BaseCorpusGenerator,
)


class MockCorpusGenerator(BaseCorpusGenerator):
    async def _generate_corpora(self, num_corpora: int, **kwargs: Any):
        if kwargs.get("raise_err", False):
            raise ValueError("test error")
        return [
            BaseCorpus(context=["test context"], scenario="test scenario")
            for _ in range(num_corpora)
        ]


class TestBaseCorpusGenerator(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.generator = MockCorpusGenerator()

    async def test_generate_corpora_success(self):
        """测试正常情况下的generate_corpora方法"""
        corpora = await self.generator.generate_corpora(num_corpora=3)
        self.assertEqual(len(corpora), 3)
        self.assertIsInstance(corpora[0], BaseCorpus)
        self.assertEqual(corpora[0].context, ["test context"])

    async def test_generate_corpora_with_callbacks(self):
        """测试带有回调的generate_corpora方法"""
        callbacks = [AsyncMock()]
        corpora = await self.generator.generate_corpora(
            num_corpora=2, callbacks=callbacks
        )
        self.assertEqual(len(corpora), 2)

    async def test_generate_corpora_with_verbose(self):
        """测试带有verbose参数的generate_corpora方法"""
        corpora = await self.generator.generate_corpora(num_corpora=1, verbose=True)
        self.assertEqual(len(corpora), 1)

    async def test_generate_corpora_error_handling(self):
        """测试generate_corpora方法中的异常处理"""
        with self.assertRaises(Exception) as context:
            await self.generator.generate_corpora(num_corpora=1, raise_err=True)
        self.assertEqual(str(context.exception), "test error")

    def test_name_property(self):
        """测试name属性"""
        self.assertEqual(self.generator.name, "mock_corpus_generator")


class TestBaseCorpus(unittest.TestCase):
    def test_base_corpus_initialization(self):
        """测试BaseCorpus的初始化"""
        corpus = BaseCorpus(
            context=["test context"],
            scenario="test scenario",
        )
        self.assertEqual(corpus.context, ["test context"])
        self.assertEqual(corpus.scenario, "test scenario")

    def test_base_corpus_with_extra_fields(self):
        """测试BaseCorpus允许额外字段"""
        corpus = BaseCorpus(context=["test context"], extra_field="extra_value")
        self.assertEqual(corpus.extra_field, "extra_value")


if __name__ == "__main__":
    unittest.main()
