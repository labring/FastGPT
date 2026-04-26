# -*- coding: utf-8 -*-

from ..data_source.base import DBTable
from ..utils import JOIN_CHAR, calculate_metrics, parse_real_cols


def calculate_retrieval_metrics(
    tables: list[DBTable], gold_sql: str, dialect="mysql", case_insensitive: bool = True
) -> tuple[float, float, float]:
    gold_cols = parse_real_cols(gold_sql, dialect, case_insensitive)
    recall_cols = set()
    for table in tables:
        for cn in table.columns.keys():
            col_name = f"{table.name}{JOIN_CHAR}{cn}"
            if case_insensitive:
                col_name = col_name.lower()
            recall_cols.add(col_name)

    tp = len(gold_cols & recall_cols)
    fp = len(recall_cols - gold_cols)
    fn = len(gold_cols - recall_cols)
    return calculate_metrics(tp, fp, fn)
