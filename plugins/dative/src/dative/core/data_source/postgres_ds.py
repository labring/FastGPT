# -*- coding: utf-8 -*-
import re
from pathlib import Path
from typing import Any, cast

import asyncpg
import orjson

from .base import DatabaseMetadata, DataSourceBase, DBServerVersion, SQLError, SQLException

with open(Path(__file__).parent / "metadata_sql" / "postgres.sql", encoding="utf-8") as f:
    METADATA_SQL = f.read()


version_pattern = re.compile(
    r".*(?:PostgreSQL|EnterpriseDB) "
    r"(\d+)\.?(\d+)?(?:\.(\d+))?(?:\.\d+)?(?:devel|beta)?"
)


class Postgres(DataSourceBase):
    """
    postgres不支持跨数据库查询
    """

    def __init__(self, host: str, port: int, username: str, password: str, db_name: str, schema: str = "public"):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.db_name = db_name
        self.schema = schema

    @property
    def dialect(self) -> str:
        return "postgres"

    @property
    def string_types(self) -> set[str]:
        return {"CHARACTER VARYING", "VARCHAR", "CHAR", "CHARACTER", "TEXT"}

    @property
    def json_array_agg_func(self) -> str:
        return "JSON_AGG"

    async def acreate_connection(self) -> asyncpg.Connection:
        conn = await asyncpg.connect(
            host=self.host,
            port=self.port,
            user=self.username,
            password=self.password,
            database=self.db_name,
        )
        return conn

    async def aget_server_version(self) -> DBServerVersion:
        sql = "SELECT VERSION() as v"
        _, rows, _ = await self.aexecute_raw_sql(sql)
        version_str = cast(str, rows[0][0])
        m = version_pattern.match(version_str)
        if not m:
            raise AssertionError("Could not determine version from string '%s'" % version_str)
        version = [int(x) for x in m.group(1, 2, 3) if x is not None]
        server_version = DBServerVersion(major=version[0], minor=version[1])
        if len(version) > 2:
            server_version.patch = version[2]
        return server_version

    async def aexecute_raw_sql(self, sql: str) -> tuple[list[str], list[tuple[Any, ...]], SQLException | None]:
        if not sql:
            return [], [], SQLException(error_type=SQLError.EmptySQL, msg="SQL语句不能为空")

        try:
            conn = await self.acreate_connection()
        except Exception as e:
            return [], [], SQLException(error_type=SQLError.DBError, msg=str(e))

        try:
            res: list[asyncpg.Record] = await conn.fetch(sql)
            return list(res[0].keys()), [tuple(x.values()) for x in res], None
        except Exception as e:
            return [], [], SQLException(error_type=SQLError.SyntaxError, msg=str(e))

    async def aget_metadata(self) -> DatabaseMetadata:
        sql = METADATA_SQL.format(schema=self.schema)
        cols, rows, err = await self.aexecute_raw_sql(sql)
        if err:
            raise ConnectionError(err.msg)
        if not rows or not rows[0][1]:
            return DatabaseMetadata(name=self.db_name)
        metadata = DatabaseMetadata.model_validate({
            "name": self.db_name,
            "tables": orjson.loads(cast(str, rows[0][1])),
        })
        return metadata
