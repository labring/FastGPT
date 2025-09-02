#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import unittest

from diting_core.utilities.slug import camel_to_snake


class TestCamelToSnake(unittest.TestCase):
    def test_single_word(self):
        # 测试单个单词
        self.assertEqual(camel_to_snake("Hello"), "hello")

    def test_two_words(self):
        # 测试两个单词
        self.assertEqual(camel_to_snake("HelloWorld"), "hello_world")

    def test_multiple_words(self):
        # 测试多个单词
        self.assertEqual(
            camel_to_snake("CamelCaseToSnakeCase"), "camel_case_to_snake_case"
        )

    def test_already_snake_case(self):
        # 测试已经是 snake_case 的字符串
        self.assertEqual(camel_to_snake("already_snake_case"), "already_snake_case")

    def test_numbers_in_string(self):
        # 测试包含数字的字符串
        self.assertEqual(camel_to_snake("Test123String"), "test123_string")


if __name__ == "__main__":
    unittest.main()
