# -*- coding: utf-8 -*-
import os
from typing import Any, Literal, Union

from pydantic import BaseModel, Field, SecretStr

from dative.core.data_source import DatabaseMetadata


class DatabaseConfigBase(BaseModel):
    host: str = Field(description="host")
    port: int = Field(default=3306, description="port")
    username: str = Field(description="username")
    password: str = Field(description="password")


class SqliteConfig(BaseModel):
    type: Literal["sqlite"] = "sqlite"
    db_path: str = Field(description="db_path")


class MysqlConfig(DatabaseConfigBase):
    type: Literal["mysql", "maria"] = "mysql"
    db_name: str = Field(description="数据库名称")
    conn_pool_size: int = Field(default=3, description="数据库连接池大小")


class PostgresConfig(DatabaseConfigBase):
    type: Literal["postgres"] = "postgres"
    db_name: str = Field(description="数据库名称")
    ns_name: str = Field(default="public", alias="schema", description="ns_name")
    conn_pool_size: int = Field(default=3, description="数据库连接池大小")


class DuckdbLocalStoreConfig(BaseModel):
    type: Literal["local"] = Field(default="local", description="数据库存储方式")
    dir_path: str = Field(description="Excel文件目录")


class DuckdbS3StoreConfig(BaseModel):
    type: Literal["s3"] = Field(default="s3", description="数据库存储方式")
    host: str = Field(description="host")
    port: int = Field(default=3306, description="port")
    access_key: str = Field(description="access_key")
    secret_key: str = Field(description="secret_key")
    bucket: str = Field(description="bucket")
    region: str = Field(default="", description="region")
    use_ssl: bool = Field(default=False, description="use_ssl")


class DuckdbConfig(BaseModel):
    type: Literal["duckdb"] = "duckdb"
    store: DuckdbLocalStoreConfig | DuckdbS3StoreConfig = Field(description="数据库存储方式", discriminator="type")


DataSourceConfig = Union[SqliteConfig, MysqlConfig, PostgresConfig, DuckdbConfig]


def default_api_key() -> SecretStr:
    if os.getenv("AIPROXY_API_TOKEN"):
        api_key = SecretStr(str(os.getenv("AIPROXY_API_TOKEN")))
    else:
        api_key = SecretStr("")
    return api_key


def default_base_url() -> str:
    if os.getenv("AIPROXY_API_ENDPOINT"):
        base_url = str(os.getenv("AIPROXY_API_ENDPOINT")) + "/v1"
    else:
        base_url = "https://api.openai.com/v1"
    return base_url


class LLMInfo(BaseModel):
    provider: Literal["openai"] = Field(default="openai", description="LLM提供者")
    model: str = Field(description="LLM模型名称")
    api_key: SecretStr = Field(default_factory=default_api_key, description="API密钥", examples=["sk-..."])
    base_url: str = Field(
        default_factory=default_base_url, description="API基础URL", examples=["https://api.openai.com/v1"]
    )
    temperature: float = Field(default=0.7, description="温度参数")
    max_tokens: int | None = Field(default=None, description="最大生成长度")
    extra_body: dict[str, Any] | None = Field(default=None)


class SqlQueryRequest(BaseModel):
    source_config: DataSourceConfig = Field(description="数据库连接信息", discriminator="type")
    sql: str


class SqlQueryResponse(BaseModel):
    cols: list[str] = Field(default=list(), description="查询结果列")
    data: list[tuple[Any, ...]] = Field(default=list(), description="查询结果数据")


class QueryByNLRequest(BaseModel):
    source_config: DataSourceConfig = Field(description="数据库连接信息", discriminator="type")
    query: str = Field(description="用户问题")
    retrieved_metadata: DatabaseMetadata = Field(description="检索到的元数据")
    generate_sql_llm: LLMInfo = Field(description="生成sql的LLM配置信息")
    evaluate_sql_llm: LLMInfo | None = Field(default=None, description="评估sql的LLM配置信息")
    schema_format: Literal["markdown", "m_schema"] = Field(default="markdown", description="schema转成prompt格式")
    evidence: str = Field(default="", description="补充说明信息")
    result_num_limit: int = Field(default=100, description="结果数量限制")


class QueryByNLResponse(BaseModel):
    answer: str = Field(description="生成的答案")
    sql: str = Field(description="生成的SQL语句")
    sql_res: SqlQueryResponse = Field(description="SQL查询结果")
    input_tokens: int = Field(description="输入token数")
    output_tokens: int = Field(description="输出token数")
