import pytest
from sqlglot import exp

from dative.core.sql_inspection.check import SQLCheck


class TestSQLCheck:
    @pytest.fixture
    def sql_check(self):
        return SQLCheck(dialect="mysql")

    def test_is_query_with_select_statement(self, sql_check):
        """测试SELECT语句是否被识别为查询"""
        sql = "SELECT * FROM users"
        assert sql_check.is_query(sql) is True

    def test_is_query_with_insert_statement(self, sql_check):
        """测试INSERT语句是否不被识别为查询"""
        sql = "INSERT INTO users (name) VALUES ('Alice')"
        assert sql_check.is_query(sql) is False

    def test_is_query_with_exp_expression(self, sql_check):
        """测试直接传入Expression对象的情况"""
        expression = exp.select("*").from_("users")
        assert sql_check.is_query(expression) is True

    def test_syntax_valid_with_correct_sql(self, sql_check):
        """测试语法正确的SQL"""
        sql = "SELECT id, name FROM users WHERE age > 18"
        result = sql_check.syntax_valid(sql)
        assert isinstance(result, exp.Expression)

    def test_syntax_valid_with_incorrect_sql(self, sql_check):
        """测试语法错误的SQL应抛出异常"""
        sql = "SELECT FROM WHERE"
        with pytest.raises(Exception):
            sql_check.syntax_valid(sql)

    def test_mysql_dialect(self):
        """测试MySQL方言"""
        sql_check = SQLCheck(dialect="mysql")
        sql = "SELECT * FROM users LIMIT 10"
        assert sql_check.is_query(sql) is True

    def test_postgres_dialect(self):
        """测试PostgreSQL方言"""
        sql_check = SQLCheck(dialect="postgres")
        sql = "SELECT * FROM users LIMIT 10"
        assert sql_check.is_query(sql) is True
