from typing import List, Any
import unittest
from diting_core.models.embeddings.base_model import BaseEmbeddings


class MockEmbeddings(BaseEmbeddings):
    async def aembed_query(self, text: str, **kwargs: Any) -> List[float]:
        return [0.1, 0.2, 0.3]

    async def aembed_documents(
        self, texts: List[str], **kwargs: Any
    ) -> List[List[float]]:
        return [[0.1, 0.2, 0.3] for _ in texts]


class TestBaseEmbeddings(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.embedding = MockEmbeddings()

    async def test_embed_text_valid(self):
        result = await self.embedding.embed_text("hello")
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 3)

    async def test_embed_text_invalid(self):
        with self.assertRaises(TypeError):
            await self.embedding.embed_text(123)  # type: ignore

    async def test_embed_texts_valid(self):
        texts = ["a", "b", "c"]
        result = await self.embedding.embed_texts(texts)
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 3)
        for emb in result:
            self.assertEqual(len(emb), 3)

    async def test_embed_texts_invalid(self):
        with self.assertRaises(TypeError):
            await self.embedding.embed_texts("not a list")  # type: ignore


if __name__ == "__main__":
    unittest.main()
