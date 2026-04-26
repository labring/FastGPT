# -*- coding: utf-8 -*-

from unittest.mock import Mock

import pytest

from src.dative.core.evaluation.schema_retrieval import calculate_f1_score


def test_calculate_f1_score_perfect_match():
    """测试检索结果与gold SQL完全匹配的情况"""
    # 创建模拟的DBTable对象
    table1 = Mock()
    table1.name = "table1"
    table1.columns = {"a": None, "b": None}  # columns.keys()返回['a', 'b']

    table2 = Mock()
    table2.name = "table2"
    table2.columns = {"c": None}

    retrieval_res = [table1, table2]
    gold_sql = "SELECT table1.a, table1.b, table2.c FROM table1 JOIN table2"

    precision, recall, f1 = calculate_f1_score(retrieval_res, gold_sql)

    # 完全匹配时，precision, recall, f1都应该是1.0
    assert precision == 1.0
    assert recall == 1.0
    assert f1 == 1.0


def test_calculate_f1_score_partial_match():
    """测试检索结果与gold SQL部分匹配的情况"""
    # 创建模拟的DBTable对象
    table1 = Mock()
    table1.name = "table1"
    table1.columns = {"a": None, "b": None}

    retrieval_res = [table1]  # 只检索到table1的列
    gold_sql = "SELECT table1.a, table1.b, table2.c FROM table1 JOIN table2"  # gold SQL需要table1和table2的列

    precision, recall, f1 = calculate_f1_score(retrieval_res, gold_sql)

    # 精确度应该是1.0 (检索到的都正确)，召回率应该是2/3 (只找到2个正确的，共3个)
    assert precision == 1.0
    assert recall == pytest.approx(2 / 3)
    assert f1 == pytest.approx(2 * (1.0 * 2 / 3) / (1.0 + 2 / 3))


def test_calculate_f1_score_no_match():
    """测试检索结果与gold SQL完全不匹配的情况"""
    # 创建模拟的DBTable对象
    table1 = Mock()
    table1.name = "table3"  # 与gold SQL中的表名不同
    table1.columns = {"d": None, "e": None}

    retrieval_res = [table1]
    gold_sql = "SELECT table1.a, table1.b, table2.c FROM table1 JOIN table2"

    precision, recall, f1 = calculate_f1_score(retrieval_res, gold_sql)

    # 没有匹配时，precision, recall, f1都应该是0.0
    assert precision == 0.0
    assert recall == 0.0
    assert f1 == 0.0


def test_calculate_f1_score_case_insensitive():
    """测试大小写不敏感的情况"""
    table1 = Mock()
    table1.name = "Table1"  # 大小写与gold SQL不同
    table1.columns = {"A": None, "B": None}

    retrieval_res = [table1]
    gold_sql = "SELECT table1.a, table1.b FROM table1"

    # 默认大小写不敏感
    precision, recall, f1 = calculate_f1_score(retrieval_res, gold_sql)

    # 应该匹配，因为大小写不敏感
    assert precision == 1.0
    assert recall == 1.0
    assert f1 == 1.0


def test_calculate_f1_score_case_sensitive():
    """测试大小写敏感的情况"""
    table1 = Mock()
    table1.name = "Table1"  # 大小写与gold SQL不同
    table1.columns = {"A": None, "B": None}

    retrieval_res = [table1]
    gold_sql = "SELECT table1.a, table1.b FROM table1"

    # 设置大小写敏感
    precision, recall, f1 = calculate_f1_score(retrieval_res, gold_sql, case_insensitive=False)

    # 应该不匹配，因为大小写敏感
    assert precision == 0.0
    assert recall == 0.0
    assert f1 == 0.0


def test_calculate_f1_score_empty_inputs():
    """测试空输入的情况"""
    # 空的检索结果和简单的SQL
    retrieval_res = []
    gold_sql = "SELECT a FROM table1"

    precision, recall, f1 = calculate_f1_score(retrieval_res, gold_sql)

    # 检索结果为空时，precision和f1应该是0，recall也应该是0
    assert precision == 0.0
    assert recall == 0.0
    assert f1 == 0.0

    # 空SQL的情况
    table1 = Mock()
    table1.name = "table1"
    table1.columns = {"a": None}

    retrieval_res = [table1]
    gold_sql = ""

    precision, recall, f1 = calculate_f1_score(retrieval_res, gold_sql)

    # SQL解析失败时应该返回0分
    assert precision == 0.0
    assert recall == 0.0
    assert f1 == 0.0
