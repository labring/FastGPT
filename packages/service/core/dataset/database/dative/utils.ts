import { BucketNameEnum } from "@fastgpt/global/common/file/constants";
import { DatabaseTypeEnum } from "@fastgpt/global/core/dataset/constants";
import type { DuckDBStoreConfigType, ExcelUploadSourceConfig } from "@fastgpt/global/core/dataset/database/api";

export interface DativeErrorResponse {
  detail?: {
    msg?: string;
    error?: string;
    detail?: string;
  };
  message?: string;
  error?: string;
}

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

export function createBucketSourceConfig(
  datasetId: string,
  teamId: string,
  tmbId: string
): ExcelUploadSourceConfig {
  return {
    type: 'mongo',
    bucket: BucketNameEnum.dataset,
    kid: datasetId,
    metadata: {
      teamId,
      uid: tmbId
    }
  };
}

export function parseDativeErrorResponse(response: any): any {
  let errorData: DativeErrorResponse = {};

  try {
    if (typeof response.data === 'string') {
      errorData = JSON.parse(response.data);
    } else {
      errorData = response.data || {};
    }
  } catch (err) {
    // If JSON parsing fails, return raw data as message
    return {
      message: `Dative error: ${response.data || 'Unknown error'}`,
      code: response.statusCode
    };
  }

  const code = response.statusCode;
  if (code >= 500) {
    return {
      message: `Dative server error: ${response.statusText || 'Internal Server Error'}`,
      code: response.status
    };
  }

  return {
    message: `${errorData.detail?.msg}: ${errorData.detail?.detail}` || 'Dative error',
    code: code
  };
}
