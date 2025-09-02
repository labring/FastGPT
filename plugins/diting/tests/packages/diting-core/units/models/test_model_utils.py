import unittest
from diting_core.models.utils import (
    deepseek_r1_filter_output,
    qwq_filter_output,
    filter_model_output,
)


class TestModelOutputFilter(unittest.TestCase):
    def test_deepseek_r1_filter_output(self):
        # Test text containing </think> tag
        input_text = "This is some thinking content</think>This is the content to keep"
        expected_output = "This is the content to keep"
        self.assertEqual(deepseek_r1_filter_output(input_text), expected_output)

        # Test text without </think> tag
        input_text = "This is a normal text"
        expected_output = "This is a normal text"
        self.assertEqual(deepseek_r1_filter_output(input_text), expected_output)

        # Test text with multiple lines
        input_text = """This is some thinking content
</think>
This is the content to keep"""
        expected_output = "This is the content to keep"
        self.assertEqual(deepseek_r1_filter_output(input_text), expected_output)

        # Test </think> tag at the beginning of the text
        input_text = "</think>This is the content to keep"
        expected_output = "This is the content to keep"
        self.assertEqual(deepseek_r1_filter_output(input_text), expected_output)

        # Test </think> tag followed by a newline
        input_text = (
            "This is some thinking content</think>\nThis is the content to keep"
        )
        expected_output = "This is the content to keep"
        self.assertEqual(deepseek_r1_filter_output(input_text), expected_output)

    def test_qwq_filter_output(self):
        # Test that qwq_filter_output behaves the same as deepseek_r1_filter_output
        input_text = "This is some thinking content</think>This is the content to keep"
        expected_output = "This is the content to keep"
        self.assertEqual(qwq_filter_output(input_text), expected_output)

    def test_filter_model_output(self):
        # Test deepseek_r1 type
        input_text = "This is some thinking content</think>This is the content to keep"
        expected_output = "This is the content to keep"
        self.assertEqual(
            filter_model_output(input_text, llm_type="deepseek_r1"), expected_output
        )

        # Test qwq type
        input_text = "This is some thinking content</think>This is the content to keep"
        expected_output = "This is the content to keep"
        self.assertEqual(
            filter_model_output(input_text, llm_type="qwq"), expected_output
        )

        # Test default type
        input_text = "This is some thinking content</think>This is the content to keep"
        expected_output = "This is the content to keep"
        self.assertEqual(filter_model_output(input_text), expected_output)

        # Test unknown type
        input_text = "This is some thinking content</think>This is the content to keep"
        expected_output = "This is the content to keep"
        self.assertEqual(
            filter_model_output(input_text, llm_type="unknown"), expected_output
        )
