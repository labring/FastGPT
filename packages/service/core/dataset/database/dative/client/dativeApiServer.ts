import { request } from '../http/request';
import type {
  SqlQueryRequest,
  SqlQueryResponse,
  SqlGenerationRequest,
  SqlGenerationResponse,
  DatabaseMetadataRequest,
  DatabaseMetadata,
  ExcelUploadRequest,
  DativeExcelUploadResponse
} from '@fastgpt/global/core/dataset/database/api';
import { forwardMultipartStream } from '../transport/stream-forward';
import { dativeUrl } from '../utils';

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

export async function uploadExcel(request: ExcelUploadRequest): Promise<DativeExcelUploadResponse> {
  const { fileStream, contentType, sourceConfig, timeout = 300000 } = request;

  const endpoint = `${dativeUrl}/api/v1/data_source/excel_upload`;

  // Forward the multipart stream with injected source_config field
  const response = await forwardMultipartStream<DativeExcelUploadResponse>({
    url: endpoint,
    method: 'POST',
    requestStream: fileStream,
    contentType,
    injectFields: [
      {
        name: 'source_config',
        value: sourceConfig
      }
    ],
    timeout
  });

  // Validate Dative response
  const result = response.body;
  if (!result || result.msg !== 'success') {
    return Promise.reject(`Excel upload failed: ${result?.msg || 'Unknown error'}`);
  }

  return result;
}
