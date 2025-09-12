import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import { readFileContentFromMongo } from '@fastgpt/service/common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import type { importEvalDatasetFromFileBody } from '@fastgpt/global/core/evaluation/dataset/api';
import { addEvalDatasetDataQualityJob } from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import { authEvalDatasetCollectionFile } from '@fastgpt/service/support/permission/evaluation/auth';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { authEvaluationDatasetDataWrite } from '@fastgpt/service/core/evaluation/common';
import { MAX_CSV_ROWS } from '@fastgpt/global/core/evaluation/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';

export type EvalDatasetImportFromFileQuery = {};
export type EvalDatasetImportFromFileBody = importEvalDatasetFromFileBody;
export type EvalDatasetImportFromFileResponse = string;

const REQUIRED_CSV_COLUMNS = ['user_input', 'expected_output'] as const;

const OPTIONAL_CSV_COLUMNS = ['actual_output', 'context', 'retrieval_context', 'metadata'] as const;

const CSV_COLUMNS = [...REQUIRED_CSV_COLUMNS, ...OPTIONAL_CSV_COLUMNS] as const;

const ENUM_TO_CSV_MAPPING = {
  [EvalDatasetDataKeyEnum.UserInput]: 'user_input',
  [EvalDatasetDataKeyEnum.ExpectedOutput]: 'expected_output',
  [EvalDatasetDataKeyEnum.ActualOutput]: 'actual_output',
  [EvalDatasetDataKeyEnum.Context]: 'context',
  [EvalDatasetDataKeyEnum.RetrievalContext]: 'retrieval_context'
} as const;

interface CSVRow {
  user_input: string;
  expected_output: string;
  actual_output?: string;
  context?: string;
  retrieval_context?: string;
  metadata?: string;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  // Add the last field
  result.push(current.trim());
  return result;
}

function normalizeHeaderName(header: string): string {
  const enumValue = header as keyof typeof ENUM_TO_CSV_MAPPING;
  if (ENUM_TO_CSV_MAPPING[enumValue]) {
    return ENUM_TO_CSV_MAPPING[enumValue];
  }
  return header;
}

function parseCSVContent(csvContent: string): CSVRow[] {
  const lines = csvContent.split('\n').filter((line) => line.trim());

  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Parse header
  const headerLine = lines[0];
  const rawHeaders = parseCSVLine(headerLine).map((h) => h.replace(/^"|"$/g, ''));
  const headers = rawHeaders.map(normalizeHeaderName);

  // Validate CSV structure
  const missingColumns = REQUIRED_CSV_COLUMNS.filter((col) => !headers.includes(col));
  if (missingColumns.length > 0) {
    throw new Error(`CSV file is missing required columns: ${missingColumns.join(', ')}`);
  }

  // Create column index mapping
  const columnIndexes: Record<string, number> = {};
  CSV_COLUMNS.forEach((col) => {
    const index = headers.indexOf(col);
    if (index !== -1) {
      columnIndexes[col] = index;
    }
  });

  // Parse data rows
  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const fields = parseCSVLine(line);

    if (fields.length !== headers.length) {
      throw new Error(`Row ${i + 1}: Expected ${headers.length} columns, got ${fields.length}`);
    }

    const row: CSVRow = {
      user_input: fields[columnIndexes.user_input]?.replace(/^"|"$/g, '') || '',
      expected_output: fields[columnIndexes.expected_output]?.replace(/^"|"$/g, '') || ''
    };

    // Add optional fields
    if (columnIndexes.actual_output !== undefined) {
      row.actual_output = fields[columnIndexes.actual_output]?.replace(/^"|"$/g, '') || '';
    }
    if (columnIndexes.context !== undefined) {
      row.context = fields[columnIndexes.context]?.replace(/^"|"$/g, '') || '';
    }
    if (columnIndexes.retrieval_context !== undefined) {
      row.retrieval_context = fields[columnIndexes.retrieval_context]?.replace(/^"|"$/g, '') || '';
    }
    if (columnIndexes.metadata !== undefined) {
      row.metadata = fields[columnIndexes.metadata]?.replace(/^"|"$/g, '') || '{}';
    }

    rows.push(row);
  }

  return rows;
}

function validateRequestParams(params: {
  fileId?: string;
  collectionId?: string;
  enableQualityEvaluation?: boolean;
  evaluationModel?: string;
}) {
  const { fileId, collectionId, enableQualityEvaluation, evaluationModel } = params;

  if (!fileId || typeof fileId !== 'string') {
    return Promise.reject(EvaluationErrEnum.fileIdRequired);
  }

  if (!collectionId || typeof collectionId !== 'string') {
    return Promise.reject(EvaluationErrEnum.datasetCollectionIdRequired);
  }

  if (typeof enableQualityEvaluation !== 'boolean') {
    return Promise.reject(EvaluationErrEnum.datasetDataEnableQualityEvalRequired);
  }

  if (enableQualityEvaluation && (!evaluationModel || typeof evaluationModel !== 'string')) {
    return Promise.reject(EvaluationErrEnum.datasetDataEvaluationModelRequiredForQuality);
  }

  if (evaluationModel && !global.llmModelMap.has(evaluationModel)) {
    return Promise.reject(EvaluationErrEnum.datasetModelNotFound);
  }
}

async function handler(
  req: ApiRequestProps<EvalDatasetImportFromFileBody, EvalDatasetImportFromFileQuery>
): Promise<EvalDatasetImportFromFileResponse> {
  const { fileId, collectionId, enableQualityEvaluation, evaluationModel } = req.body;

  const { teamId, tmbId } = await authEvaluationDatasetDataWrite(collectionId, {
    req,
    authToken: true,
    authApiKey: true
  });

  validateRequestParams({ fileId, collectionId, enableQualityEvaluation, evaluationModel });

  if (enableQualityEvaluation && evaluationModel) {
    await checkTeamAIPoints(teamId);
  }

  const { file } = await authEvalDatasetCollectionFile({
    req,
    authToken: true,
    authApiKey: true,
    fileId,
    per: WritePermissionVal
  });

  const filename = file.filename?.toLowerCase() || '';
  if (!filename.endsWith('.csv')) {
    return Promise.reject(EvaluationErrEnum.fileMustBeCSV);
  }

  const datasetCollection = await MongoEvalDatasetCollection.findById(collectionId);
  if (!datasetCollection) {
    return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
  }

  if (String(datasetCollection.teamId) !== teamId) {
    return Promise.reject(EvaluationErrEnum.evalInsufficientPermission);
  }
  try {
    const { rawText } = await readFileContentFromMongo({
      teamId,
      tmbId,
      bucketName: BucketNameEnum.evaluation,
      fileId,
      getFormatText: false
    });

    const csvRows = parseCSVContent(rawText);

    if (csvRows.length === 0) {
      return Promise.reject(EvaluationErrEnum.csvNoDataRows);
    }

    if (csvRows.length > MAX_CSV_ROWS) {
      return Promise.reject(EvaluationErrEnum.csvTooManyRows);
    }

    const evalDatasetRecords = csvRows.map((row) => {
      let contextArray: string[] = [];
      let retrievalContextArray: string[] = [];
      let metadataObj: Record<string, any> = {};

      if (row.context !== undefined && row.context) {
        try {
          const parsed = JSON.parse(row.context);
          if (Array.isArray(parsed)) {
            contextArray = parsed.filter((item) => typeof item === 'string');
          } else if (typeof parsed === 'string') {
            contextArray = [parsed];
          }
        } catch {
          // If not JSON, treat as single string
          contextArray = [row.context];
        }
      }

      if (row.retrieval_context !== undefined && row.retrieval_context) {
        try {
          const parsed = JSON.parse(row.retrieval_context);
          if (Array.isArray(parsed)) {
            retrievalContextArray = parsed.filter((item) => typeof item === 'string');
          } else if (typeof parsed === 'string') {
            retrievalContextArray = [parsed];
          }
        } catch {
          // If not JSON, treat as single string
          retrievalContextArray = [row.retrieval_context];
        }
      }

      if (row.metadata !== undefined && row.metadata) {
        try {
          const parsed = JSON.parse(row.metadata);
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            metadataObj = parsed;
          }
        } catch {
          // Invalid JSON, use empty object
          metadataObj = {};
        }
      }

      return {
        teamId,
        tmbId,
        datasetId: collectionId,
        [EvalDatasetDataKeyEnum.UserInput]: row.user_input,
        [EvalDatasetDataKeyEnum.ExpectedOutput]: row.expected_output,
        [EvalDatasetDataKeyEnum.ActualOutput]: row.actual_output || '',
        [EvalDatasetDataKeyEnum.Context]: contextArray,
        [EvalDatasetDataKeyEnum.RetrievalContext]: retrievalContextArray,
        [EvalDatasetDataKeyEnum.Metadata]: {
          ...metadataObj,
          ...(enableQualityEvaluation
            ? {}
            : { qualityStatus: EvalDatasetDataQualityStatusEnum.unevaluated })
        },
        createFrom: EvalDatasetDataCreateFromEnum.fileImport
      };
    });

    const insertedRecords = await mongoSessionRun(async (session) => {
      return await MongoEvalDatasetData.insertMany(evalDatasetRecords, {
        session,
        ordered: false // Continue if some documents fail
      });
    });

    if (enableQualityEvaluation && evaluationModel) {
      const evaluationJobs = insertedRecords.map((record) =>
        addEvalDatasetDataQualityJob({
          dataId: record._id.toString(),
          evaluationModel: evaluationModel
        })
      );
      await Promise.allSettled(evaluationJobs);
    }

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.IMPORT_EVALUATION_DATASET_DATA,
        params: {
          collectionName: datasetCollection.name,
          recordCount: insertedRecords.length
        }
      });
    })();

    return 'success';
  } catch (error: any) {
    // Handle parsing errors
    if (error.message && typeof error.message === 'string') {
      return Promise.reject(EvaluationErrEnum.csvParsingError);
    }
    throw error;
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
