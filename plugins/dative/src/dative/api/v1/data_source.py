# -*- coding: utf-8 -*-

import traceback
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import ORJSONResponse
from langchain_openai import ChatOpenAI

from dative.api.v1.data_model import (
    DataSourceConfig,
    QueryByNLRequest,
    QueryByNLResponse,
    SqlQueryRequest,
    SqlQueryResponse,
)
from dative.core.agent import Agent
from dative.core.data_source import (
    DatabaseMetadata,
    DataSourceBase,
    DBServerVersion,
    DuckdbLocalStore,
    DuckdbS3Store,
    Mysql,
    Postgres,
    Sqlite,
)

router = APIRouter()


async def valid_data_source_config(source_config: DataSourceConfig) -> DataSourceBase:
    ds: DataSourceBase
    if source_config.type == "mysql" or source_config.type == "maria":
        ds = Mysql(
            host=source_config.host,
            port=source_config.port,
            username=source_config.username,
            password=source_config.password,
            db_name=source_config.db_name,
        )
    elif source_config.type == "postgres":
        ds = Postgres(
            host=source_config.host,
            port=source_config.port,
            username=source_config.username,
            password=source_config.password,
            db_name=source_config.db_name,
            schema=source_config.ns_name,
        )
    elif source_config.type == "duckdb":
        if source_config.store.type == "local":
            ds = DuckdbLocalStore(dir_path=source_config.store.dir_path)
        elif source_config.store.type == "s3":
            ds = DuckdbS3Store(
                host=source_config.store.host,
                port=source_config.store.port,
                access_key=source_config.store.access_key,
                secret_key=source_config.store.secret_key,
                bucket=source_config.store.bucket,
                region=source_config.store.region,
                use_ssl=source_config.store.use_ssl,
            )
        else:
            raise HTTPException(
                status_code=400,
                detail={
                    "msg": f"不支持的duckdb存储类型：{source_config.store}",
                    "error": f"不支持的duckdb存储类型：{source_config.store}",
                },
            )
    elif source_config.type == "sqlite":
        ds = Sqlite(source_config.db_path)
    else:
        raise HTTPException(
            status_code=400,
            detail={
                "msg": f"不支持的数据源类型：{source_config.type}",
                "error": f"不支持的数据源类型：{source_config.type}",
            },
        )
    try:
        await ds.conn_test()
        return ds
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail={
                "msg": "数据源连接失败，请检查连接信息是否正确",
                "error": str(e),
            },
        )


@router.post("/conn_test", response_class=ORJSONResponse, dependencies=[Depends(valid_data_source_config)])
async def conn_test() -> str:
    return "ok"


@router.post("/get_metadata", response_class=ORJSONResponse)
async def get_metadata(ds: Annotated[DataSourceBase, Depends(valid_data_source_config)]) -> DatabaseMetadata:
    try:
        return await ds.aget_metadata()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail={
                "msg": "获取数据库元信息失败",
                "error": str(e),
            },
        )

@router.post("/get_metadata_with_value_examples", response_class=ORJSONResponse)
async def get_metadata_with_value_example(
    ds: Annotated[DataSourceBase, Depends(valid_data_source_config)]
) -> DatabaseMetadata:
    try:
        return await ds.aget_metadata_with_value_examples()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail={
                "msg": "获取数据库元信息失败",
                "error": str(e),
            },
        )

@router.post("/get_server_version", response_class=ORJSONResponse)
async def get_server_version(ds: Annotated[DataSourceBase, Depends(valid_data_source_config)]) -> DBServerVersion:
    try:
        return await ds.aget_server_version()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail={
                "msg": "获取数据库版本信息失败",
                "error": str(e),
            },
        )


@router.post("/sql_query", response_class=ORJSONResponse)
async def sql_query(request: SqlQueryRequest) -> SqlQueryResponse:
    ds = await valid_data_source_config(source_config=request.source_config)
    cols, data, err = await ds.aexecute_raw_sql(sql=request.sql)
    if err:
        raise HTTPException(
            status_code=400,
            detail={
                "msg": "数据库查询失败",
                "error": err.msg,
            },
        )
    return SqlQueryResponse(cols=cols, data=data)


@router.post("/query_by_nl", response_class=ORJSONResponse)
async def query_by_nl(request: QueryByNLRequest) -> QueryByNLResponse:
    ds = await valid_data_source_config(source_config=request.source_config)
    try:
        server_version = await ds.aget_server_version()
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(
            status_code=400,
            detail={
                "msg": "数据库连接失败，请检查连接信息是否正确",
                "error": str(e),
            },
        )
    generate_sql_llm = ChatOpenAI(
        model=request.generate_sql_llm.model,
        api_key=request.generate_sql_llm.api_key,
        base_url=request.generate_sql_llm.base_url,
        stream_usage=True,
        extra_body=request.generate_sql_llm.extra_body
    )
    if request.evaluate_sql_llm:
        evaluate_sql_llm = ChatOpenAI(
            model=request.evaluate_sql_llm.model,
            api_key=request.evaluate_sql_llm.api_key,
            base_url=request.evaluate_sql_llm.base_url,
            stream_usage=True,
            extra_body=request.evaluate_sql_llm.extra_body
        )
    else:
        evaluate_sql_llm = None
    agent = Agent(
        ds=ds,
        db_server_version=server_version,
        generate_sql_llm=generate_sql_llm,
        result_num_limit=request.result_num_limit,
        evaluate_sql_llm=evaluate_sql_llm,
    )
    try:
        answer, sql, cols, data, total_input_tokens, total_output_tokens = await agent.arun(
            query=request.query, metadata=request.retrieved_metadata, evidence=request.evidence
        )
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(
            status_code=400,
            detail={
                "msg": "数据库检索失败",
                "error": str(e),
            },
        )
    return QueryByNLResponse(
        answer=answer,
        sql=sql,
        sql_res=SqlQueryResponse(cols=cols, data=data),
        input_tokens=total_input_tokens,
        output_tokens=total_output_tokens,
    )
