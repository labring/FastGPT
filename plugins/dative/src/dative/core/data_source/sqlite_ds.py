# -*- coding: utf-8 -*-
from pathlib import Path
from typing import Any, cast

import aiosqlite
import orjson

from .base import DatabaseMetadata, DataSourceBase, DBServerVersion, SQLError, SQLException

with open(Path(__file__).parent / "metadata_sql" / "sqlite.sql", encoding="utf-8") as f:
    METADATA_SQL = f.read()


class Sqlite(DataSourceBase):
    def __init__(self, db_path: str | Path):
        if isinstance(db_path, str):
            db_path = Path(db_path)
        self.db_path = db_path
        self.db_name = db_path.stem

    @property
    def dialect(self) -> str:
        return "sqlite"

    @property
    def string_types(self) -> set[str]:
        return {"TEXT"}

    @property
    def json_array_agg_func(self) -> str:
        return "JSON_GROUP_ARRAY"

    async def conn_test(self) -> bool:
        if self.db_path.is_file():
            return True
        return False

    async def aget_server_version(self) -> DBServerVersion:
        version = [int(i) for i in aiosqlite.sqlite_version.split(".") if i.isdigit()]
        server_version = DBServerVersion(major=version[0], minor=version[1])
        if len(version) > 2:
            server_version.patch = version[2]
        return server_version

    async def aget_metadata(self) -> DatabaseMetadata:
        _, rows, err = await self.aexecute_raw_sql(METADATA_SQL)
        if err:
            raise ConnectionError(err.msg)
        if not rows or not rows[0][1]:
            return DatabaseMetadata(name=self.db_name)
        metadata = DatabaseMetadata.model_validate({
            "name": self.db_name,
            "tables": orjson.loads(cast(str, rows[0][0])),
        })
        return metadata

    async def aexecute_raw_sql(self, sql: str) -> tuple[list[str], list[tuple[Any, ...]], SQLException | None]:
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute(sql)
                res = await cursor.fetchall()
                return [i[0] for i in cursor.description], cast(list[tuple[Any, ...]], res), None
        except Exception as e:
            return [], [], SQLException(error_type=SQLError.SyntaxError, msg=str(e))
