# -*- coding: utf-8 -*-
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, cast

import duckdb
import orjson
import pyarrow as pa
from aiobotocore.session import get_session
from botocore.exceptions import ClientError
from fastexcel import read_excel

from .base import DatabaseMetadata, DataSourceBase, DBServerVersion, SQLError, SQLException

with open(Path(__file__).parent / "metadata_sql" / "duckdb.sql", encoding="utf-8") as f:
    METADATA_SQL = f.read()

supported_file_extensions = {"xlsx", "xls", "xlsm", "xlsb", "csv", "json", "parquet"}


class DuckdbBase(DataSourceBase, ABC):
    """
    duckdb 和 polars对比：polars目前不支持对excel的sql查询优化（ 懒加载api：pl.scan_ ）
    在文件较大，数据量较多时，通过sql查询优化不用把数据全部加载到内存进行查询。
    """

    def __init__(self, db_name: str):
        self.db_name = db_name
        self.conn = self.get_conn()
        self.loaded = False

    @abstractmethod
    def get_conn(self) -> duckdb.DuckDBPyConnection:
        """"""

    @property
    def dialect(self) -> str:
        return "duckdb"

    @property
    def string_types(self) -> set[str]:
        return {"VARCHAR", "CHAR", "BPCHAR", "TEXT", "STRING"}

    @property
    def json_array_agg_func(self) -> str:
        return "JSON_GROUP_ARRAY"

    async def aget_server_version(self) -> DBServerVersion:
        version = [int(i) for i in duckdb.__version__.split(".") if i.isdigit()]
        server_version = DBServerVersion(major=version[0], minor=version[1])
        if len(version) > 2:
            server_version.patch = version[2]
        return server_version

    @abstractmethod
    async def read_files(self) -> list[tuple[str, str]]:
        """"""

    async def load_data(self) -> None:
        if self.loaded:
            return

        # 加载新数据，重置连接
        self.conn = self.get_conn()
        files = await self.read_files()
        for name, file_path in files:
            extension = Path(file_path).suffix.split(".")[-1].lower()
            if extension == "xlsx":
                sql = f"select * from read_xlsx('{file_path}')"
                self.conn.register(f"{name}", self.conn.sql(sql))
            elif extension == "csv":
                sql = f"select * from read_csv('{file_path}')"
                self.conn.register(f"{name}", self.conn.sql(sql))
            elif extension == "json":
                sql = f"select * from read_json('{file_path}')"
                self.conn.register(f"{name}", self.conn.sql(sql))
            elif extension == "parquet":
                sql = f"select * from read_parquet('{file_path}')"
                self.conn.register(f"{name}", self.conn.sql(sql))
            else:
                wb = read_excel(file_path)
                record_batch = wb.load_sheet(wb.sheet_names[0]).to_arrow()
                self.conn.register(f"{name}", pa.Table.from_batches([record_batch]))
        self.loaded = True

    async def aexecute_raw_sql(self, sql: str) -> tuple[list[str], list[tuple[Any, ...]], SQLException | None]:
        try:
            df: duckdb.DuckDBPyRelation = self.conn.sql(sql)
            return df.columns, df.fetchall(), None
        except duckdb.Error as e:
            return [], [], SQLException(error_type=SQLError.SyntaxError, msg=str(e))

    async def aget_metadata(self) -> DatabaseMetadata:
        await self.load_data()

        _, rows, err = await self.aexecute_raw_sql(METADATA_SQL.format(db_name=self.db_name))
        if err:
            raise ConnectionError(err.msg)
        if not rows or not rows[0][1]:
            return DatabaseMetadata(name=self.db_name)
        metadata = DatabaseMetadata.model_validate({
            "name": self.db_name,
            "tables": orjson.loads(cast(str, rows[0][1])),
        })
        return metadata


class DuckdbLocalStore(DuckdbBase):
    def __init__(self, dir_path: str | Path):
        if isinstance(dir_path, str):
            dir_path = Path(dir_path)
        super().__init__(dir_path.stem)

        self.dir_path = dir_path
        self.conn = self.get_conn()
        self.loaded = False

    def get_conn(self) -> duckdb.DuckDBPyConnection:
        conn = duckdb.connect(config={"allow_unsigned_extensions": True})
        conn.load_extension("excel")
        return conn

    async def conn_test(self) -> bool:
        if self.dir_path.is_dir():
            await self.load_data()
            return True
        return False

    async def read_files(self) -> list[tuple[str, str]]:
        excel_files: list[tuple[str, str]] = []
        for file_path in self.dir_path.glob("*"):
            if file_path.is_file() and file_path.suffix.split(".")[-1].lower() in supported_file_extensions:
                excel_files.append((file_path.stem, str(file_path.absolute())))

        return excel_files


class DuckdbS3Store(DuckdbBase):
    def __init__(
        self,
        host: str,
        port: int,
        access_key: str,
        secret_key: str,
        bucket: str,
        region: str = "",
        use_ssl: bool = False,
    ):
        self.host = host
        self.port = port
        self.endpoint = f"{self.host}:{self.port}"
        self.access_key = access_key
        self.secret_key = secret_key
        self.bucket = bucket
        self.db_name = bucket
        self.region = region
        self.use_ssl = use_ssl
        self.conn = self.get_conn()
        super().__init__(self.db_name)

        if self.use_ssl:
            self.endpoint_url = f"https://{self.endpoint}"
        else:
            self.endpoint_url = f"http://{self.endpoint}"
        self.session = get_session()

    def get_conn(self) -> duckdb.DuckDBPyConnection:
        conn = duckdb.connect()
        conn.load_extension("httpfs")
        sql = f"""
CREATE OR REPLACE SECRET secret (
    TYPE s3,
    ENDPOINT '{self.endpoint}',
    KEY_ID '{self.access_key}',
    SECRET '{self.secret_key}',
    USE_SSL {orjson.dumps(self.use_ssl).decode()},
    URL_STYLE 'path',
    REGION '{self.region!r}'
);
"""
        conn.execute(sql)
        return conn

    async def conn_test(self) -> bool:
        try:
            async with self.session.create_client(
                service_name="s3",
                endpoint_url="http://localhost:9000",
                aws_secret_access_key=self.secret_key,
                aws_access_key_id=self.access_key,
                region_name=self.region,
            ) as client:
                await client.head_bucket(Bucket=self.bucket)
                return True
        except ClientError:
            return False

    async def read_files(self) -> list[tuple[str, str]]:
        excel_files: list[tuple[str, str]] = []
        async with self.session.create_client(
            service_name="s3",
            endpoint_url="http://localhost:9000",
            aws_secret_access_key=self.secret_key,
            aws_access_key_id=self.access_key,
            region_name=self.region,
        ) as client:
            paginator = client.get_paginator("list_objects_v2")
            async for result in paginator.paginate(Bucket=self.bucket):
                for obj in result.get("Contents", []):
                    if obj["Key"].split(".")[-1].lower() in supported_file_extensions:
                        excel_files.append((obj["Key"].split(".")[0], f"s3://{self.bucket}/{obj['Key']}"))
        return excel_files
