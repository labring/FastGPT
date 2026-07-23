# -*- coding: utf-8 -*-
from abc import ABC, abstractmethod
from enum import StrEnum, auto
from typing import Any, cast

import orjson
from pydantic import BaseModel, Field
from sqlglot import exp

from dative.core.utils import convert_value2str, is_date, is_email, is_number, is_valid_uuid, truncate_text


class TableColumn(BaseModel):
    name: str = Field(description="列名")
    type: str = Field(description="数据类型")
    comment: str = Field(default="", description="描述信息")
    auto_increment: bool = Field(default=False, description="是否自增")
    nullable: bool = Field(default=True, description="是否允许为空")
    default: Any = Field(default=None, description="默认值")
    examples: list[Any] = Field(default_factory=list, description="值样例")
    enabled: bool = Field(default=True, description="是否启用")
    value_index: bool = Field(default=False, description="是否启用值索引")


class ConstraintKey(BaseModel):
    name: str = Field(description="约束名")
    column: str = Field(description="约束字段名")


class TableForeignKey(ConstraintKey):
    referenced_schema: str = Field(description="引用schema")
    referenced_table: str = Field(description="引用表名")
    referenced_column: str = Field(description="引用字段名")


class DBTable(BaseModel):
    name: str = Field(description="表名")
    ns_name: str | None = Field(default=None, alias="schema", description="ns_name")
    comment: str = Field(default="", description="描述信息")
    columns: dict[str, TableColumn] = Field(default_factory=dict, description="列")
    primary_keys: list[str] = Field(default_factory=list, description="主键")
    foreign_keys: list[TableForeignKey] = Field(default_factory=list, description="外键")
    enabled: bool = Field(default=True, description="是否启用")

    def column_type(self, case_insensitive: bool = True) -> dict[str, str]:
        schema_type: dict[str, str] = dict()
        for col in self.columns.values():
            schema_type[col.name] = col.type
            if case_insensitive:
                schema_type[col.name.title()] = col.type
                schema_type[col.name.lower()] = col.type
                schema_type[col.name.upper()] = col.type
        return schema_type

    def to_markdown(self) -> str:
        s = f"""
### Table name: {self.name}
{self.comment}
#### Columns:
|Name|Description|Type|Examples|
|---|---|---|---|
"""
        for col in self.columns.values():
            if not col.enabled:
                continue

            example_values = "<br>".join([convert_value2str(v) for v in col.examples])
            s += f"|{col.name}|{col.comment}|{col.type}|{example_values}|\n"

        if self.primary_keys:
            s += f"#### Primary Keys: {tuple(self.primary_keys)}\n"
        if self.foreign_keys:
            fk_str = "#### Foreign Keys: \n"
            for fk in self.foreign_keys:
                # 只显示同一个schema的外键
                if self.ns_name is None or self.ns_name == fk.referenced_schema:
                    fk_str += f" - {fk.column} -> {fk.referenced_table}.{fk.referenced_column}\n"
            s += fk_str

        return s

    def to_m_schema(self, db_name: str | None = None) -> str:
        # XiYanSQL: https://github.com/XGenerationLab/M-Schema
        output = []
        if db_name:
            table_comment = f"# Table: {db_name}.{self.name}"
        else:
            table_comment = f"# Table: {self.name}"
        if self.comment:
            table_comment += f", {self.comment}"
        output.append(table_comment)

        field_lines = []
        for col in self.columns.values():
            if not col.enabled:
                continue

            field_line = f"({col.name}: {col.type.upper()}"
            if col.name in self.primary_keys:
                field_line += ", Primary Key"
            if col.comment:
                field_line += f", {col.comment.strip()}"
            if col.examples:
                example_values = ", ".join([convert_value2str(v) for v in col.examples])
                field_line += f", Examples: [{example_values}]"
            field_line += ")"
            field_lines.append(field_line)

        output.append("[")
        output.append(",\n".join(field_lines))
        output.append("]")
        return "\n".join(output)


class SQLError(StrEnum):
    EmptySQL = auto()
    SyntaxError = auto()
    NotAllowedOperation = auto()
    DBError = auto()
    UnknownError = auto()


class SQLException(BaseModel):
    error_type: SQLError
    msg: str
    code: int = Field(default=0, description="错误码")


class DatabaseMetadata(BaseModel):
    name: str = Field(description="数据库名")
    comment: str = Field(default="", description="描述信息")
    tables: list[DBTable] = Field(default_factory=list, description="表")

    def to_markdown(self) -> str:
        s = f"""
# Database name: {self.name}
{self.comment}
## Tables:
"""
        for table in self.tables:
            if table.enabled:
                s += f"{table.to_markdown()}\n"
        return s

    def to_m_schema(self) -> str:
        output = [f"【DB_ID】 {self.name}"]
        if self.comment:
            output.append(self.comment)
        output.append("【Schema】")
        output.append("schema format: (column name: data type, is primary key, comment, examples)")
        fks = []
        for t in self.tables:
            if not t.enabled:
                continue
            output.append(t.to_m_schema(self.name))

            for fk in t.foreign_keys:
                # 只显示同一个schema的外键
                if t.ns_name is None or t.ns_name == fk.referenced_schema:
                    fks.append(f"{t.name}.{fk.column}={fk.referenced_table}.{fk.referenced_column}")

        if fks:
            output.append("【Foreign Keys】")
            output.extend(fks)
        output.append("\n")
        return "\n".join(output)


class DBServerVersion(BaseModel):
    major: int = Field(description="主版本号")
    minor: int = Field(description="次版本号")
    patch: int | None = Field(default=None, description="修订号/补丁号")

    def __str__(self) -> str:
        s = f"{self.major}.{self.minor}"
        if self.patch is None:
            return s
        return s + f".{self.patch}"

    def __repr__(self) -> str:
        return str(self)


class DBException(BaseModel):
    code: int = Field(description="异常码")
    msg: str = Field(description="异常信息")


class DataSourceBase(ABC):
    @property
    @abstractmethod
    def dialect(self) -> str:
        """return the type of data source"""
        raise NotImplementedError

    @property
    @abstractmethod
    def string_types(self) -> set[str]:
        """return the string types of data source"""
        raise NotImplementedError

    @property
    @abstractmethod
    def json_array_agg_func(self) -> str:
        """
        获取JSON数组聚合函数的SQL表达式

        Returns:
            str: 返回适用于当前数据库类型的JSON数组聚合函数名称
        """
        raise NotImplementedError

    async def conn_test(self) -> bool:
        await self.aexecute_raw_sql("SELECT 1")
        return True

    @abstractmethod
    async def aget_server_version(self) -> DBServerVersion:
        """get server version"""

    @abstractmethod
    async def aget_metadata(self) -> DatabaseMetadata:
        """get database metadata"""

    @abstractmethod
    async def aexecute_raw_sql(self, sql: str) -> tuple[list[str], list[tuple[Any, ...]], SQLException | None]:
        """"""

    @staticmethod
    async def distinct_values_exp(table_name: str, col_name: str, limit: int = 3) -> exp.Expression:
        sql_exp = (
            exp.select(exp.column(col_name))
            .distinct()
            .from_(exp.to_identifier(table_name))
            .where(exp.not_(exp.column(col_name).is_(exp.null())))
            .limit(limit)
        )
        return sql_exp

    async def aget_metadata_with_value_examples(
        self, value_num: int = 3, value_str_max_length: int = 40
    ) -> DatabaseMetadata:
        """
        获取数据库元数据及示例值信息

        Args:
            value_num (int): 每个字段需要获取的示例值数量，默认为3
            value_str_max_length (int): 字符串类型示例值的最大长度，默认为40

        Returns:
            DatabaseMetadata: 包含数据库元数据和示例值信息的对象
        """
        db_metadata = await self.aget_metadata()

        for t in db_metadata.tables:
            col_exp = []
            for col in t.columns.values():
                col_exp.append(await self.agg_distinct_values(t.name, col.name, value_num))

            sql = exp.union(*col_exp, distinct=False).sql(dialect=self.dialect)
            _, rows, _ = await self.aexecute_raw_sql(sql)
            rows = cast(list[tuple[str, str]], rows)
            for i in range(len(rows)):
                col_name = rows[i][0]
                if rows[i][1]:
                    examples = orjson.loads(cast(str, rows[i][1]))
                    str_examples = [
                        truncate_text(convert_value2str(v), max_length=value_str_max_length) for v in examples
                    ]
                    t.columns[col_name].examples = str_examples
                    if (
                        t.columns[col_name].type in self.string_types
                        and not is_valid_uuid(str_examples[0])
                        and not is_number(str_examples[0])
                        and not is_date(str_examples[0])
                        and not is_email(str_examples[0])
                    ):
                        t.columns[col_name].value_index = True

        return db_metadata

    async def agg_distinct_values(self, table_name: str, col_name: str, limit: int = 3) -> exp.Expression:
        dis_exp = await self.distinct_values_exp(table_name, col_name, limit)
        sql_exp = exp.select(
            exp.Alias(this=exp.Literal.string(col_name), alias="name"),
            exp.Alias(this=exp.func(self.json_array_agg_func, exp.column(col_name)), alias="examples"),
        ).from_(exp.Subquery(this=dis_exp, alias="t"))
        return sql_exp
