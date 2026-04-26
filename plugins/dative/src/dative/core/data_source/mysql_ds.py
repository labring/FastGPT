# -*- coding: utf-8 -*-
import re
from pathlib import Path
from typing import Any, cast

import orjson
from mysql.connector.aio import MySQLConnection, connect

from .base import DatabaseMetadata, DataSourceBase, DBServerVersion, SQLError, SQLException

with open(Path(__file__).parent / "metadata_sql" / "mysql.sql", encoding="utf-8") as f:
    METADATA_SQL = f.read()

version_p = re.compile(r"\b(v)?(\d+)\.(\d+)(?:\.(\d+))?(?:-([a-zA-Z0-9]+))?\b")


class Mysql(DataSourceBase):
    def __init__(self, host: str, port: int, username: str, password: str, db_name: str):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.db_name = db_name

    @property
    def dialect(self) -> str:
        return "mysql"

    @property
    def string_types(self) -> set[str]:
        return {
            "CHAR",
            "VARCHAR",
            "TEXT",
            "TINYTEXT",
            "MEDIUMTEXT",
            "LONGTEXT",
        }

    @property
    def json_array_agg_func(self) -> str:
        return "JSON_ARRAYAGG"

    async def acreate_connection(self) -> MySQLConnection:
        conn = await connect(
            host=self.host, port=self.port, user=self.username, password=self.password, database=self.db_name
        )
        return cast(MySQLConnection, conn)

    async def aget_server_version(self) -> DBServerVersion:
        sql = "SELECT VERSION()"
        _, rows, _ = await self.aexecute_raw_sql(sql)
        version = cast(str, rows[0][0])
        match = version_p.match(version)
        if match:
            has_v, major, minor, patch, suffix = match.groups()
            server_version = DBServerVersion(major=int(major), minor=int(minor))
            if patch:
                server_version.patch = int(patch)
            return server_version
        else:
            raise ValueError(f"Invalid version: {version}")

    async def aexecute_raw_sql(self, sql: str) -> tuple[list[str], list[tuple[Any, ...]], SQLException | None]:
        if not sql:
            return [], [], SQLException(error_type=SQLError.EmptySQL, msg="SQL语句不能为空")

        try:
            conn = await self.acreate_connection()
        except Exception as e:
            return [], [], SQLException(error_type=SQLError.DBError, msg=e.args[1])

        try:
            cursor = await conn.cursor()
            await cursor.execute(sql)
            res = await cursor.fetchall()
            if cursor.description:
                cols = [i[0] for i in cursor.description]
            else:
                cols = []
            await cursor.close()
            await conn.close()
            return cols, res, None
        except Exception as e:
            return [], [], SQLException(error_type=SQLError.SyntaxError, msg=e.args[1], code=e.args[0])

    async def aget_metadata(self) -> DatabaseMetadata:
        sql = METADATA_SQL.format(db_name=self.db_name)
        cols, rows, err = await self.aexecute_raw_sql(sql)
        if err:
            raise ConnectionError(err.msg)
        if not rows or not rows[0][1]:
            return DatabaseMetadata(name=self.db_name)
        metadata = DatabaseMetadata.model_validate({
            "name": rows[0][0],
            "tables": orjson.loads(cast(str, rows[0][1])),
        })
        return metadata
