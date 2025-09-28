# -*- coding: utf-8 -*-

import pytest
from sqlglot import exp, parse_one

from dative.core.sql_inspection.optimization import SQLOptimization


class TestSQLOptimization:
    """SQLOptimization 类的单元测试"""

    @pytest.fixture
    def mysql_optimizer(self):
        """MySQL 5.7 版本的优化器"""
        return SQLOptimization(dialect="mysql", db_major_version=5)

    @pytest.fixture
    def mysql8_optimizer(self):
        """MySQL 8.0 版本的优化器"""
        return SQLOptimization(dialect="mysql", db_major_version=8)

    @pytest.fixture
    def postgres_optimizer(self):
        """PostgreSQL 优化器"""
        return SQLOptimization(dialect="postgres", db_major_version=13)

    def test_cte_to_subquery(self):
        """测试 CTE 转换为子查询的功能"""
        sql = """
              WITH cte1 AS (SELECT id, name FROM users WHERE age > 18)
              SELECT * \
              FROM cte1 \
              WHERE name LIKE 'A%' \
              """
        expression = parse_one(sql)
        result = SQLOptimization.cte_to_subquery(expression)

        # 验证 CTE 已被替换为子查询
        assert "WITH" not in result.sql()
        assert "users" in result.sql()
        assert "age > 18" in result.sql()

    def test_optimize_in_limit_subquery(self):
        """测试优化带 LIMIT 的 IN 子查询"""
        sql = """
              SELECT * \
              FROM orders
              WHERE user_id IN (SELECT id FROM users LIMIT 10) \
              """
        expression = parse_one(sql)
        result = SQLOptimization.optimize_in_limit_subquery(expression)

        # 验证 LIMIT 子查询已被重写
        subquery = result.find(exp.In).args["query"]
        assert subquery is not None
        # 确保新的子查询结构正确
        assert isinstance(subquery, exp.Subquery)

    def test_fix_missing_group_by_when_agg_func_case1(self):
        """测试修复 GROUP BY 缺失字段 - 情况1"""
        sql = "SELECT a, b FROM x GROUP BY a"
        expression = parse_one(sql)
        result = SQLOptimization.fix_missing_group_by_when_agg_func(expression)

        # 应该添加缺失的 GROUP BY 字段 b
        group_clause = result.args.get("group")
        assert group_clause is not None
        group_expressions = group_clause.expressions
        assert len(group_expressions) == 2

    def test_fix_missing_group_by_when_agg_func_case2(self):
        """测试修复 GROUP BY 缺失字段 - 情况2"""
        sql = "SELECT a, COUNT(b) FROM x"
        expression = parse_one(sql)
        result = SQLOptimization.fix_missing_group_by_when_agg_func(expression)

        # 应该自动添加 GROUP BY a
        group_clause = result.args.get("group")
        assert group_clause is not None

    def test_fix_missing_group_by_when_agg_func_case3(self):
        """测试修复 GROUP BY 缺失字段 - 情况3"""
        sql = "SELECT a FROM x ORDER BY MAX(b)"
        expression = parse_one(sql)
        result = SQLOptimization.fix_missing_group_by_when_agg_func(expression)

        # 应该添加 GROUP BY a
        group_clause = result.args.get("group")
        assert group_clause is not None

    @pytest.mark.asyncio
    async def test_arun_with_string_sql(self, mysql_optimizer):
        """测试 arun 方法处理字符串 SQL"""
        sql = "SELECT id, name FROM users"
        result = mysql_optimizer.arun(sql, result_num_limit=100)

        assert "LIMIT 100" in result

    @pytest.mark.asyncio
    async def test_arun_with_expression(self, mysql_optimizer):
        """测试 arun 方法处理表达式对象"""
        expression = parse_one("SELECT id, name FROM users")
        result = mysql_optimizer.arun(expression, result_num_limit=50)

        assert "LIMIT 50" in result

    @pytest.mark.asyncio
    async def test_mysql_cte_handling_old_version(self, mysql_optimizer):
        """测试 MySQL 低版本 CTE 处理（应转换为子查询）"""
        sql = """
              WITH cte AS (SELECT id FROM users)
              SELECT *
              FROM cte \
              """
        result = mysql_optimizer.arun(sql)

        # 在 MySQL 5.x 中，CTE 应被转换为子查询
        assert "WITH" not in result

    @pytest.mark.asyncio
    async def test_mysql_cte_handling_new_version(self, mysql8_optimizer):
        """测试 MySQL 8.0+ CTE 处理（应保留 CTE）"""
        sql = """
              WITH cte AS (SELECT id FROM users)
              SELECT *
              FROM cte
                       join b
                            on cte.id = b.id \
              """
        result = mysql8_optimizer.arun(sql)
        # 在 MySQL 8.0+ 中，CTE 应被保留
        assert "WITH" in result

    @pytest.mark.asyncio
    async def test_optimization_with_schema(self, postgres_optimizer):
        """测试带模式信息的优化"""
        sql = "SELECT u.name, COUNT(o.id) FROM users u JOIN orders o ON u.id = o.user_id"
        schema = {"users": {"id": "INT", "name": "VARCHAR"}, "orders": {"id": "INT", "user_id": "INT"}}
        result = postgres_optimizer.arun(sql, schema_type=schema)

        assert result is not None
        assert isinstance(result, str)
