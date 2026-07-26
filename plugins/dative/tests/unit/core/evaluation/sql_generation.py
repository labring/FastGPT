# -*- coding: utf-8 -*-

import pytest

from src.dative.core.evaluation.sql_generation import calculate_ex, calculate_f1_score, calculate_row_match


class TestCalculateEx:
    """测试 calculate_ex 函数"""

    def test_exact_match(self):
        """测试完全匹配的情况"""
        predicted = [(1, "A"), (2, "B")]
        ground_truth = [(1, "A"), (2, "B")]
        assert calculate_ex(predicted, ground_truth) == 1

    def test_exact_match_different_order(self):
        """测试顺序不同但内容相同的匹配"""
        predicted = [(2, "B"), (1, "A")]
        ground_truth = [(1, "A"), (2, "B")]
        assert calculate_ex(predicted, ground_truth) == 1

    def test_no_match(self):
        """测试完全不匹配的情况"""
        predicted = [(1, "A"), (2, "B")]
        ground_truth = [(3, "C"), (4, "D")]
        assert calculate_ex(predicted, ground_truth) == 0

    def test_partial_match(self):
        """测试部分匹配的情况"""
        predicted = [(1, "A"), (2, "B")]
        ground_truth = [(1, "A"), (3, "C")]
        assert calculate_ex(predicted, ground_truth) == 0

    def test_empty_inputs(self):
        """测试空输入的情况"""
        assert calculate_ex([], []) == 1
        assert calculate_ex([(1, "A")], []) == 0
        assert calculate_ex([], [(1, "A")]) == 0


class TestCalculateRowMatch:
    """测试 calculate_row_match 函数"""

    def test_perfect_match(self):
        """测试行完全匹配的情况"""
        predicted = (1, "A", 3.14)
        ground_truth = (1, "A", 3.14)
        match_pct, pred_only_pct, truth_only_pct = calculate_row_match(predicted, ground_truth)
        assert match_pct == 1.0
        assert pred_only_pct == 0.0
        assert truth_only_pct == 0.0

    def test_partial_match(self):
        """测试行部分匹配的情况"""
        predicted = (1, "B", 3.14)
        ground_truth = (1, "A", 3.14)
        match_pct, pred_only_pct, truth_only_pct = calculate_row_match(predicted, ground_truth)
        # 2个值匹配(1和3.14)，共3列
        assert match_pct == pytest.approx(2 / 3)
        assert pred_only_pct == pytest.approx(1 / 3)
        assert truth_only_pct == pytest.approx(1 / 3)

    def test_no_match(self):
        """测试行完全不匹配的情况"""
        predicted = (2, "B", 2.71)
        ground_truth = (1, "A", 3.14)
        match_pct, pred_only_pct, truth_only_pct = calculate_row_match(predicted, ground_truth)
        assert match_pct == 0.0
        assert pred_only_pct == 1.0
        assert truth_only_pct == 1.0

    def test_duplicate_values(self):
        """测试包含重复值的情况"""
        predicted = (1, 1, "A")
        ground_truth = (1, "A", "A")
        match_pct, pred_only_pct, truth_only_pct = calculate_row_match(predicted, ground_truth)
        # 1和A都存在于ground_truth中
        assert match_pct == 1.0
        assert pred_only_pct == 0.0
        assert truth_only_pct == 0.0


class TestCalculateF1Score:
    """测试 calculate_f1_score 函数"""

    def test_perfect_match(self):
        """测试完全匹配的情况"""
        predicted = [(1, "A"), (2, "B")]
        ground_truth = [(1, "A"), (2, "B")]
        f1_score = calculate_f1_score(predicted, ground_truth)
        assert f1_score == 1.0

    def test_perfect_match_different_order(self):
        """测试顺序不同但内容相同的匹配"""
        predicted = [(2, "B"), (1, "A")]
        ground_truth = [(1, "A"), (2, "B")]
        f1_score = calculate_f1_score(predicted, ground_truth)
        assert f1_score == 1.0

    def test_empty_results(self):
        """测试都为空的情况"""
        f1_score = calculate_f1_score([], [])
        assert f1_score == 1.0

    def test_one_empty_result(self):
        """测试一个为空的情况"""
        predicted = [(1, "A")]
        ground_truth = []
        f1_score = calculate_f1_score(predicted, ground_truth)
        assert f1_score == 0.0

        predicted = []
        ground_truth = [(1, "A")]
        f1_score = calculate_f1_score(predicted, ground_truth)
        assert f1_score == 0.0

    def test_partial_match(self):
        """测试部分匹配的情况"""
        predicted = [(1, "A", 10), (3, "C", 30)]
        ground_truth = [(1, "A", 10), (2, "B", 20)]

        # 第一行完全匹配(1.0)，第二行部分匹配(部分值匹配)
        f1_score = calculate_f1_score(predicted, ground_truth)
        # 需要确保返回的是一个合理的f1分数(0-1之间)
        assert 0.0 <= f1_score <= 1.0

    def test_duplicate_rows(self):
        """测试重复行的情况"""
        predicted = [(1, "A"), (1, "A"), (2, "B")]
        ground_truth = [(1, "A"), (2, "B"), (2, "B")]
        f1_score = calculate_f1_score(predicted, ground_truth)
        # 重复项应该被去除，结果应该与去重后相同
        assert 0.0 <= f1_score <= 1.0

    def test_different_row_lengths(self):
        """测试行长度不同的情况"""
        predicted = [(1, "A", 10, "extra")]
        ground_truth = [(1, "A", 10)]
        # 这种情况可能产生意外结果，但函数应该能处理
        f1_score = calculate_f1_score(predicted, ground_truth)
        assert 0.0 <= f1_score <= 1.0
