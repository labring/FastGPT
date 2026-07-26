# -*- coding: utf-8 -*-
from typing import Any, Literal, Optional

from langchain_core.language_models import BaseChatModel
from sqlglot.errors import SqlglotError

from . import sql_generation as sql_gen
from . import sql_res_evaluation as sql_eval
from .data_source import DatabaseMetadata, DataSourceBase, DBServerVersion, SQLError
from .sql_inspection import SQLCheck, SQLOptimization


class Agent:
    def __init__(
        self,
        ds: DataSourceBase,
        db_server_version: DBServerVersion,
        generate_sql_llm: BaseChatModel,
        result_num_limit: int = 100,
        schema_format: Literal["markdown", "m_schema"] = "m_schema",
        max_attempts: int = 2,
        evaluate_sql_llm: Optional[BaseChatModel] = None,
    ):
        self.ds = ds
        self.generate_sql_llm = generate_sql_llm
        self.schema_format = schema_format
        self.db_server_version = db_server_version
        self.sql_check = SQLCheck(ds.dialect)
        self.sql_opt = SQLOptimization(dialect=ds.dialect, db_major_version=db_server_version.major)
        self.result_num_limit = result_num_limit
        self.max_attempts = max_attempts
        self.evaluate_sql_llm = evaluate_sql_llm

    async def arun(
        self, query: str, metadata: DatabaseMetadata, evidence: str = ""
    ) -> tuple[str, str, list[str], list[tuple[Any, ...]], int, int]:
        answer = None
        sql = ""
        cols: list[str] = []
        data: list[tuple[Any, ...]] = []
        total_input_tokens = 0
        total_output_tokens = 0
        attempts = 0

        schema_str = f"# Database server info: {self.ds.dialect} {self.db_server_version}\n"
        if self.schema_format == "markdown":
            schema_str += metadata.to_markdown()
        else:
            schema_str += metadata.to_m_schema()
        schema_type = {table.name: table.column_type() for table in metadata.tables if table.enabled}
        current_sql, error_msg = None, None
        while attempts < self.max_attempts:
            answer, sql, input_tokens, output_tokens, error_msg = await sql_gen.arun(
                query=query,
                llm=self.generate_sql_llm,
                db_info=schema_str,
                evidence=evidence,
                error_sql=current_sql,
                error_msg=error_msg,
            )
            total_input_tokens += input_tokens
            total_output_tokens += output_tokens
            if answer is not None:
                return answer, sql, cols, data, total_input_tokens, total_output_tokens
            elif error_msg is None and sql:
                try:
                    sql_exp = self.sql_check.syntax_valid(sql)
                    if not self.sql_check.is_query(sql_exp):
                        return answer or "", sql, cols, data, total_input_tokens, total_output_tokens

                    sql = self.sql_opt.arun(sql_exp, schema_type=schema_type, result_num_limit=self.result_num_limit)
                except SqlglotError as e:
                    error_msg = f"SQL语法错误：{e}"

                if not error_msg:
                    cols, data, err = await self.ds.aexecute_raw_sql(sql)
                    if err:
                        if err.error_type != SQLError.SyntaxError:
                            return answer or "", sql, cols, data, total_input_tokens, total_output_tokens
                        else:
                            error_msg = err.msg

                if not error_msg and self.evaluate_sql_llm:
                    answer, input_tokens, output_tokens, error_msg = await sql_eval.arun(
                        query=query,
                        llm=self.evaluate_sql_llm,
                        db_info=schema_str,
                        sql=sql,
                        res_rows=data,
                        evidence=evidence,
                    )
                    total_input_tokens += input_tokens
                    total_output_tokens += output_tokens

            if not error_msg:
                break
            attempts += 1
            current_sql = sql

        return answer or "", sql, cols, data, total_input_tokens, total_output_tokens
