# -*- coding: utf-8 -*-

import asyncio
import datetime
import functools
import inspect
import os
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from typing import Any, Callable

import json_repair as json
from dateutil.parser import parse as date_parse
from langchain_core.messages import AIMessage
from sqlglot import exp, parse_one
from sqlglot.optimizer.qualify import qualify
from sqlglot.optimizer.scope import Scope, traverse_scope

JOIN_CHAR = "."

email_re = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")


def text2json(text: str) -> dict[Any, Any]:
    res = json.loads(text)
    if isinstance(res, dict):
        return res
    return dict()


def get_beijing_time(fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    utc_now = datetime.datetime.now(datetime.UTC)
    beijing_now = utc_now + datetime.timedelta(hours=8)
    formatted_time = beijing_now.strftime(fmt)
    return formatted_time


def cal_tokens(msg: AIMessage) -> tuple[int, int]:
    if msg.usage_metadata:
        return msg.usage_metadata["input_tokens"], msg.usage_metadata["output_tokens"]
    elif msg.response_metadata.get("token_usage", {}).get("input_tokens"):
        token_usage = msg.response_metadata.get("token_usage", {})
        input_tokens = token_usage.get("input_tokens", 0)
        output_tokens = token_usage.get("output_tokens", 0)
        return input_tokens, output_tokens
    else:
        return 0, 0


def convert_value2str(value: Any) -> str:
    if isinstance(value, str):
        return value
    elif isinstance(value, Decimal):
        return str(float(value))
    elif value is None:
        return ""
    else:
        return str(value)


def is_valid_uuid(s: str) -> bool:
    try:
        uuid.UUID(s)
        return True
    except ValueError:
        return False


def is_number(value: Any) -> bool:
    try:
        float(value)
        return True
    except (ValueError, TypeError):
        return False


def is_date(value: Any) -> bool:
    try:
        date_parse(value)
        return True
    except ValueError:
        return False


def is_email(value: Any) -> bool:
    if email_re.match(value):
        return True
    return False


def truncate_text(content: Any, *, max_length: int, suffix: str = "...") -> Any:
    if not isinstance(content, str) or max_length <= 0:
        return content

    if len(content) <= max_length:
        return content

    if max_length <= len(suffix):
        return content[:max_length]

    # 确保截断后的文本不会超过最大长度，且不会在单词中间截断。
    return content[: max_length - len(suffix)].rsplit(" ", 1)[0] + suffix


def truncate_text_by_byte(content: Any, *, max_length: int, suffix: str = "...", encoding: str = "utf-8") -> Any:
    if not isinstance(content, str) or max_length <= 0:
        return content

    encoded = content.encode(encoding)
    if len(encoded) <= max_length:
        return content

    suffix_bytes = suffix.encode(encoding)
    available_bytes = max_length - len(suffix_bytes)

    if available_bytes <= 0:
        for i in range(max_length, 0, -1):
            try:
                return encoded[:i].decode(encoding)
            except UnicodeDecodeError:
                continue
        return ""

    # 尝试找到合适的截断位置，保证解码安全
    for i in range(available_bytes, 0, -1):
        try:
            truncated_part = encoded[:i].decode(encoding)
            return truncated_part + suffix
        except UnicodeDecodeError:
            continue

    return suffix_bytes[:max_length].decode(encoding, errors="ignore")


async def async_parallel_exec(func: Callable[[Any], Any], data: list[Any], concurrency: int | None = None) -> list[Any]:
    if not inspect.iscoroutinefunction(func):
        async_func = functools.partial(asyncio.to_thread, func)  # type: ignore
    else:
        async_func = func  # type: ignore

    if len(data) == 0:
        return []

    if concurrency is None:
        concurrency = len(data)
    semaphore = asyncio.Semaphore(concurrency)

    async def worker(*args, **kwargs) -> Any:
        async with semaphore:
            return await async_func(*args, **kwargs)  # type: ignore

    t_list = []
    for i in range(len(data)):
        if isinstance(data[i], (list, tuple)):
            t_list.append(worker(*data[i]))
        elif isinstance(data[i], dict):
            t_list.append(worker(**data[i]))
        else:
            t_list.append(worker(data[i]))

    return await asyncio.gather(*t_list)


def parallel_exec(
    func: Callable[[Any], Any], data: list[dict[Any, Any] | tuple[Any] | list[Any]], concurrency: int | None = None
) -> list[Any]:
    if len(data) == 0:
        return []

    t_list = []
    if concurrency is None:
        concurrency = min(len(data), 32, (os.cpu_count() or 1) + 4)
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        for i in range(len(data)):
            if isinstance(data[i], (list, tuple)):
                t_list.append(pool.submit(func, *data[i]))
            elif isinstance(data[i], dict):
                t_list.append(pool.submit(func, **data[i]))  # type: ignore
            else:
                t_list.append(pool.submit(func, data[i]))

    return [t.result() for t in t_list]


def exec_async_func(func: Callable[[Any], Any], *args, **kwargs) -> Any:
    if inspect.iscoroutinefunction(func):
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
        return loop.run_until_complete(func(*args, **kwargs))
    else:
        return func(*args, **kwargs)


def parse_col_name_from_scope(
    scope: Scope, real_cols: set[str], cte_names: set[str], case_insensitive: bool = True
) -> None:
    if case_insensitive:
        scope.sources = {k.lower(): v for k, v in scope.sources.items()}

    for col in scope.columns:
        if col.table:
            tn = col.table
            if case_insensitive:
                tn = tn.lower()
            if tn in scope.sources:
                source = scope.sources[tn]
                if isinstance(source, exp.Table) and tn not in cte_names:
                    src_tn = source.name
                    col_name = f"{src_tn}{JOIN_CHAR}{col.name}"
                    if case_insensitive:
                        col_name = col_name.lower()
                    real_cols.add(col_name)
        elif not col.table and scope.tables:
            tn = scope.tables[0].name
            if tn not in cte_names:
                col_name = f"{tn}{JOIN_CHAR}{col.name}"
                if case_insensitive:
                    col_name = col_name.lower()
                real_cols.add(col_name)


def parse_real_cols(sql: str, dialect="mysql", case_insensitive: bool = True) -> set[str]:
    try:
        parsed = parse_one(sql, dialect=dialect)
        parsed = qualify(parsed, dialect=dialect)
        cte_names = set()
        for cte in parsed.find_all(exp.CTE):
            cte_names.add(cte.alias)
        scopes = traverse_scope(parsed)
        real_cols: set[str] = set()
        for scope in scopes:
            parse_col_name_from_scope(scope, real_cols, cte_names, case_insensitive)
        return real_cols
    except Exception as e:
        print(f"Error when parsing, error: {e}")
        return set()


def calculate_metrics(tp: float, fp: float, fn: float) -> tuple[float, float, float]:
    precision = tp / (tp + fp) if tp + fp > 0 else 0
    recall = tp / (tp + fn) if tp + fn > 0 else 0
    f1_score = 2 * precision * recall / (precision + recall) if precision + recall > 0 else 0
    return precision, recall, f1_score
