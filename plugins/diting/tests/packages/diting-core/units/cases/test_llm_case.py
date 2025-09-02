import unittest
from diting_core.cases.llm_case import LLMCase


class TestLLMCase(unittest.TestCase):
    def test_llm_case_initialization(self):
        case = LLMCase(
            user_input="Test input",
            actual_output="Test output",
            expected_output="Expected output",
            context=["context1"],
            retrieval_context=["retrieval1"],
        )

        self.assertEqual(case.user_input, "Test input")
        self.assertEqual(case.actual_output, "Test output")
        self.assertEqual(case.expected_output, "Expected output")
        self.assertEqual(case.context, ["context1"])
        self.assertEqual(case.retrieval_context, ["retrieval1"])

    def test_llm_case_with_optional_fields(self):
        case = LLMCase(user_input="Test input", actual_output="Test output")

        self.assertIsNone(case.expected_output)
        self.assertIsNone(case.context)
        self.assertIsNone(case.retrieval_context)


if __name__ == "__main__":
    unittest.main()
