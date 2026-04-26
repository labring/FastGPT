# -*- coding: utf-8 -*-
import asyncio
import datetime
import uuid
from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from dative.core.utils import (
    async_parallel_exec,
    cal_tokens,
    calculate_f1,
    exec_async_func,
    get_beijing_time,
    is_date,
    is_email,
    is_number,
    is_valid_uuid,
    parallel_exec,
    parse_real_cols,
    text2json,
    truncate_text,
    truncate_text_by_byte,
)
from src.dative.core.utils import convert_value2str


def test_text2json_valid_json():
    text = '{"name": "Alice", "age": 30}'
    expected = {"name": "Alice", "age": 30}
    assert text2json(text) == expected


def test_text2json_invalid_json():
    text = "invalid json"
    expected = {}
    assert text2json(text) == expected


def test_text2json_non_dict_result():
    text = '["not", "a", "dict"]'
    expected = {}
    assert text2json(text) == expected


def test_case_001_usage_metadata_exists():
    msg = MagicMock()
    msg.usage_metadata = {"input_tokens": 10, "output_tokens": 20}
    msg.response_metadata = {}
    result = cal_tokens(msg)

    assert result == (10, 20)


def test_case_002_token_usage_in_response_metadata():
    msg = MagicMock()
    msg.usage_metadata = None
    msg.response_metadata = {"token_usage": {"input_tokens": 5, "output_tokens": 15}}
    result = cal_tokens(msg)
    assert result == (5, 15)


def test_get_beijing_time_default_format():
    result = get_beijing_time()
    assert datetime.datetime.strptime(result, "%Y-%m-%d %H:%M:%S")


def test_get_beijing_time_custom_format():
    fmt = "%Y/%m/%d"
    result = get_beijing_time(fmt)
    assert datetime.datetime.strptime(result, fmt)


def test_convert_value2str_string():
    assert convert_value2str("hello") == "hello"


def test_convert_value2str_decimal():
    assert convert_value2str(Decimal("10.5")) == "10.5"


def test_convert_value2str_none():
    assert convert_value2str(None) == ""


def test_convert_value2str_other_types():
    assert convert_value2str(123) == "123"
    assert convert_value2str(45.67) == "45.67"
    assert convert_value2str(True) == "True"


def test_is_valid_uuid():
    valid_uuid = str(uuid.uuid4())
    assert is_valid_uuid(valid_uuid) is True
    assert is_valid_uuid("invalid-uuid") is False


def test_is_number():
    assert is_number("123") is True
    assert is_number("123.45") is True
    assert is_number(123) is True
    assert is_number("not_a_number") is False
    assert is_number(None) is False


def test_is_date():
    assert is_date("2023-01-01") is True
    assert is_date("Jan 1, 2023") is True
    assert is_date("invalid-date") is False


def test_is_email():
    assert is_email("test@example.com") is True
    assert is_email("invalid-email") is False


def test_truncate_text():
    text = "This is a long text for testing"
    assert truncate_text(text, max_length=10) == "This..."
    assert truncate_text(text, max_length=100) == text
    assert truncate_text(text, max_length=3) == "Thi"
    assert truncate_text(123, max_length=10) == 123


def test_truncate_text_by_byte():
    text = "这是一个用于测试的长文本"
    result = truncate_text_by_byte(text, max_length=20)
    assert isinstance(result, str)
    assert len(result.encode("utf-8")) <= 20

    # 测试英文文本
    english_text = "This is English text"
    result = truncate_text_by_byte(english_text, max_length=15)
    assert len(result.encode("utf-8")) <= 15


def sample_function(x):
    return x * 2


async def async_sample_function(x):
    await asyncio.sleep(0.01)  # 模拟异步操作
    return x * 2


def test_parallel_exec():
    data = [1, 2, 3, 4, 5]
    result = parallel_exec(sample_function, data)
    assert result == [2, 4, 6, 8, 10]


def test_parallel_exec_with_kwargs():
    def func_with_kwargs(a, b):
        return a + b

    data = [{"a": 1, "b": 2}, {"a": 3, "b": 4}]
    result = parallel_exec(func_with_kwargs, data)
    assert result == [3, 7]


@pytest.mark.asyncio
async def test_async_parallel_exec():
    data = [1, 2, 3, 4, 5]
    result = await async_parallel_exec(async_sample_function, data)
    assert result == [2, 4, 6, 8, 10]


@pytest.mark.asyncio
async def test_async_parallel_exec_with_sync_function():
    data = [1, 2, 3, 4, 5]
    result = await async_parallel_exec(sample_function, data)
    assert result == [2, 4, 6, 8, 10]


async def async_add(a, b):
    await asyncio.sleep(0.1)  # 模拟异步操作
    return a + b


def test_exec_async_func():
    result = exec_async_func(async_add, 1, 2)
    assert result == 3


def test_exec_async_func_with_kwargs():
    result = exec_async_func(async_add, a=1, b=2)
    assert result == 3


def test_exec_async_func_with_mixed_args():
    result = exec_async_func(async_add, 1, b=2)
    assert result == 3


def test_calculate_f1_normal_case():
    """测试正常情况下的F1计算"""
    precision, recall, f1_score = calculate_f1(10, 5, 3)
    assert precision == 10 / 15  # 0.6667
    assert recall == 10 / 13  # 0.7692
    expected_f1 = 2 * precision * recall / (precision + recall)
    assert f1_score == expected_f1


def test_calculate_f1_zero_precision_and_recall():
    """测试精确度和召回率都为0的情况"""
    precision, recall, f1_score = calculate_f1(0, 0, 0)
    assert precision == 0
    assert recall == 0
    assert f1_score == 0


def test_calculate_f1_zero_precision():
    """测试精确度为0的情况"""
    precision, recall, f1_score = calculate_f1(0, 5, 5)
    assert precision == 0
    assert recall == 0
    assert f1_score == 0


def test_calculate_f1_zero_recall():
    """测试召回率为0的情况"""
    precision, recall, f1_score = calculate_f1(0, 0, 5)
    assert precision == 0
    assert recall == 0
    assert f1_score == 0


def test_parse_real_cols_simple_select():
    """测试简单SELECT查询"""
    sql = "SELECT a, b FROM table1"
    result = parse_real_cols(sql)
    expected = {"table1.a", "table1.b"}
    assert result == expected


def test_parse_real_cols_with_join():
    """测试包含JOIN的查询"""
    sql = "SELECT t1.a, t2.b FROM table1 t1 JOIN table2 t2 ON t1.id = t2.id"
    result = parse_real_cols(sql)
    expected = {"table1.a", "table1.id", "table2.b", "table2.id"}
    assert result == expected


def test_parse_real_cols_with_cte():
    """测试包含CTE的查询"""
    sql = """
          WITH cte1 AS (SELECT a FROM table1)
          SELECT cte1.a, table2.b
          FROM cte1
                   JOIN table2 ON cte1.a = table2.a \
          """
    result = parse_real_cols(sql)
    expected = {"table1.a", "table2.a", "table2.b"}
    assert result == expected


def test_parse_real_cols_case_insensitive():
    """测试大小写不敏感情况"""
    sql = "SELECT A, b FROM Table1"
    result = parse_real_cols(sql, case_insensitive=True)
    expected = {"table1.a", "table1.b"}
    assert result == expected


def test_parse_real_cols_case_sensitive():
    """测试大小写敏感情况"""
    sql = "SELECT A, b FROM Table1"
    result = parse_real_cols(sql, case_insensitive=False)
    expected = {"Table1.A", "Table1.b"}
    assert result == expected
