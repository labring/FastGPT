# -*- coding: utf-8 -*-

from typing import Any, cast

from sqlglot import ParseError, exp, parse_one
from sqlglot.optimizer.eliminate_subqueries import eliminate_subqueries
from sqlglot.optimizer.optimizer import RULES, optimize


class SQLOptimization:
    def __init__(self, dialect: str, db_major_version: int):
        self.dialect = dialect
        self.db_major_version = db_major_version

    @staticmethod
    def cte_to_subquery(expression: exp.Expression) -> exp.Expression:
        # 收集所有 CTE
        cte_names = {}
        for cte in expression.find_all(exp.CTE):
            alias = cte.alias
            query = cte.this
            cte_names[alias] = query
            # 移除原始 CTE 节点
            if cte.parent:
                cte.parent.pop()

        if not cte_names:
            return expression

        # 替换所有对 CTE 的引用为子查询
        def replace_cte_with_subquery(node: exp.Expression) -> exp.Expression:
            if isinstance(node, exp.Table) and node.name in cte_names:
                subquery = cte_names[node.name]
                return exp.Subquery(this=subquery.copy(), alias=node.alias or node.name)

            return node

        return expression.transform(replace_cte_with_subquery)

    @staticmethod
    def optimize_in_limit_subquery(expression: exp.Expression) -> exp.Expression:
        """
        Avoid 'LIMIT & IN/ALL/ANY/SOME subquery'
        """
        for in_expr in expression.find_all(exp.In):
            subquery = in_expr.args.get("query")
            if not subquery:
                continue
            if subquery.this.find(exp.Limit):
                t = subquery.this.args.get("from").this
                if t.args.get("alias"):
                    alias = t.args.get("alias").this.this
                else:
                    alias = exp.TableAlias(this=exp.Identifier(this="t"))
                derived_table = exp.Subquery(this=subquery.this.copy(), alias=alias)
                # 构建新的 SELECT t.id FROM (subquery) AS t
                new_subquery_select = exp.select(*subquery.this.expressions).from_(derived_table)
                # 替换 IN 的子查询
                in_expr.set("query", exp.Subquery(this=new_subquery_select))

        return expression

    @staticmethod
    def fix_missing_group_by_when_agg_func(expression: exp.Expression) -> exp.Expression:
        """
        case2：SELECT a, COUNT(b) FROM x  -->  SELECT a, b FROM x GROUP BY a
        case3：SELECT a FROM x ORDER BY MAX(b)  -->  SELECT a FROM x GROUP BY a ORDER BY MAX(b)
        """
        for select_expr in expression.find_all(exp.Select):
            select_agg = False
            not_agg_query_cols = dict()
            group_cols = dict()
            order_by_agg = False
            for col in select_expr.expressions:
                if isinstance(col, exp.Column):
                    not_agg_query_cols[col.this.this] = col
                elif isinstance(col, exp.AggFunc):
                    select_agg = True
                elif isinstance(col, exp.Alias):
                    if isinstance(col.this, exp.Column):
                        not_agg_query_cols[col.this.this.this] = col.this
                    elif isinstance(col.this, exp.AggFunc):
                        select_agg = True

            if expression.args.get("group"):
                for col in expression.args["group"].expressions:
                    group_cols[col.this.this] = col
            if expression.args.get("order"):
                for order_col in expression.args["order"].expressions:
                    if isinstance(order_col.this, exp.AggFunc):
                        order_by_agg = True

            if group_cols or (select_agg and not_agg_query_cols) or order_by_agg:
                for col in not_agg_query_cols:
                    if col not in group_cols:
                        group_cols[col] = not_agg_query_cols[col]

            if group_cols:
                select_expr.set("group", exp.Group(expressions=group_cols.values()))

        return expression

    @staticmethod
    def set_limit(expression: exp.Expression, result_num_limit: int):
        if expression.args.get("limit"):
            limit_exp = cast(exp.Limit, expression.args.get("limit"))
            limit = min(result_num_limit, int(limit_exp.expression.this))
        else:
            limit = result_num_limit
        expression.set("limit", exp.Limit(expression=exp.Literal.number(limit)))

    def arun(
        self,
        sql_or_exp: str | exp.Expression,
        schema_type: dict[str, dict[str, Any]] | None = None,
        result_num_limit: int | None = None,
    ) -> str:
        """
        Args:
            sql_or_exp:
            schema_type: db schema type, a mapping in one of the following forms:
                1. {table: {col: type}}
                2. {db: {table: {col: type}}}
                3. {catalog: {db: {table: {col: type}}}}
            result_num_limit: int
        Returns: str, optimized sql
        """
        if isinstance(sql_or_exp, exp.Expression):
            expression = sql_or_exp
        else:
            try:
                expression = parse_one(sql_or_exp, dialect=self.dialect)
            except ParseError:
                expression = parse_one(sql_or_exp)

        if result_num_limit and result_num_limit > 0:
            self.set_limit(expression, result_num_limit)

        rules = list(RULES)
        if self.dialect == "mysql" and self.db_major_version < 8:
            # mysql 8.0以上才支持 CTE，否则只能用子查询
            rules.remove(eliminate_subqueries)
            rules.append(self.cte_to_subquery)

        # 优化 in limit 子查询
        rules.append(self.optimize_in_limit_subquery)
        # 当聚合查询时，修复sql中 GROUP BY 缺少的字段
        rules.append(self.fix_missing_group_by_when_agg_func)
        expression = optimize(
            expression,
            schema=schema_type,
            dialect=self.dialect,
            rules=rules,  # type: ignore
            identify=False,
        )
        return expression.sql(self.dialect)
