# -*- coding: utf-8 -*-

from sqlglot import exp, parse_one


class SQLCheck:
    def __init__(self, dialect: str):
        self.dialect = dialect

    def is_query(self, sql_or_exp: str | exp.Expression) -> bool:
        """判断是否是查询语句"""
        if isinstance(sql_or_exp, exp.Expression):
            expression = sql_or_exp
        else:
            expression = parse_one(sql_or_exp, dialect=self.dialect)
        return isinstance(expression, exp.Query)

    def syntax_valid(self, sql: str) -> exp.Expression:
        """基本语法验证"""
        return parse_one(sql, dialect=self.dialect)
