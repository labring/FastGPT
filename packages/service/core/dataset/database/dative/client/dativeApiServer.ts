import { request } from '../http/request';
import type {
  SqlQueryRequest,
  SqlQueryResponse,
  SqlGenerationRequest,
  SqlGenerationResponse,
  DatabaseMetadataRequest,
  DatabaseMetadata,
  DuckDBStoreConfigType
} from '@fastgpt/global/core/dataset/database/api';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { DatabaseTypeEnum } from '@fastgpt/global/core/dataset/constants';

export function getDuckDBStoreConfig(datasetId: string) {
  return {
    type: DatabaseTypeEnum.duckdb,
    store: {
      type: 'mongo',
      bucket: BucketNameEnum.dataset,
      kid: datasetId
    }
  } as DuckDBStoreConfigType;
}
export async function sqlQuery(req: SqlQueryRequest): Promise<SqlQueryResponse> {
  return request<SqlQueryResponse, SqlQueryRequest>({
    url: '/api/v1/data_source/sql_query',
    method: 'POST',
    data: req
  });
}

export async function queryByNL(req: SqlGenerationRequest): Promise<SqlGenerationResponse> {
  return request<SqlGenerationResponse, SqlGenerationRequest>({
    url: '/api/v1/data_source/query_by_nl',
    method: 'POST',
    data: req
  });
}

export async function getMetadata(req: DatabaseMetadataRequest): Promise<DatabaseMetadata> {
  return request<DatabaseMetadata, DatabaseMetadataRequest>({
    url: '/api/v1/data_source/get_metadata',
    method: 'POST',
    data: req
  });
}

export async function getMetadataWithValueExamples(
  req: DatabaseMetadataRequest
): Promise<DatabaseMetadata> {
  return request<DatabaseMetadata, DatabaseMetadataRequest>({
    url: '/api/v1/data_source/get_metadata_with_value_examples',
    method: 'POST',
    data: req
  });
}
