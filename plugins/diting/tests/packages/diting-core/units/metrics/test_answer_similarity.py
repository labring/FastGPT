import unittest
from diting_core.metrics.answer_similarity.answer_similarity import AnswerSimilarity
from diting_core.metrics.base_metric import MetricValue
from diting_core.cases.llm_case import LLMCase
from mock_embedding import MockEmbeddings


class TestAnswerSimilarity(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.metric = AnswerSimilarity(embedding_model=MockEmbeddings())

    async def test_similarity_score_normal_case(self):
        test_case = LLMCase(
            actual_output="This is actual", expected_output="This is expected"
        )
        result: MetricValue = await self.metric.compute(test_case)
        self.assertIsInstance(result, MetricValue)
        assert result.score is not None
        self.assertAlmostEqual(
            result.score, 1.0, places=4
        )  # since mock returns same vectors
        assert result.reason is not None
        self.assertIn("cosine similarity score", result.reason)


if __name__ == "__main__":
    unittest.main()
