import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/dataset/evalDatasetDataSchema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum,
  EvalDatasetDataQualityStatusEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import type { importEvalDatasetFromFileBody } from '@fastgpt/global/core/evaluation/dataset/api';
import { addEvalDatasetDataQualityJob } from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import {
  authEvaluationDatasetDataWrite,
  authEvaluationDatasetCreate
} from '@fastgpt/service/core/evaluation/common';
import {
  MAX_CSV_ROWS,
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH
} from '@fastgpt/global/core/evaluation/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import {
  checkTeamAIPoints,
  checkTeamEvalDatasetLimit
} from '@fastgpt/service/support/permission/teamLimit';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import { getDefaultEvaluationModel } from '@fastgpt/service/core/ai/model';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { NextApiRequest, NextApiResponse } from 'next';

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

function validateFilePath(filePath: string): string {
  const path = require('path');
  const fs = require('fs');

  // Check for directory traversal attempts in the original path
  if (filePath.includes('..') || filePath.includes('..\\')) {
    throw new Error('Invalid file path: directory traversal detected');
  }

  // Normalize the path to resolve any . and .. segments
  const normalizedPath = path.normalize(filePath);

  // Get the absolute path
  const absolutePath = path.resolve(normalizedPath);

  // ensure normalized path doesn't contain traversal after normalization
  if (normalizedPath.includes('..') || normalizedPath.includes('..\\')) {
    throw new Error('Invalid file path: directory traversal detected');
  }

  // Verify the file exists and is actually a file (not a directory)
  try {
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      throw new Error('Invalid file path: path is not a file');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('directory traversal')) {
      throw error;
    }
    throw new Error('Invalid file path: file does not exist or is not accessible');
  }

  return absolutePath;
}

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
    return [];
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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<EvalDatasetImportFromFileResponse> {
  const filePaths: string[] = [];

  try {
    const upload = getUploadModel({ maxSize: global.feConfigs?.uploadFileMaxSize });
    const { files, data } = await upload.getUploadFiles<importEvalDatasetFromFileBody>(req, res);

    files.forEach((file) => filePaths.push(file.path));

    if (!files || files.length === 0) {
      return Promise.reject(EvaluationErrEnum.fileIdRequired);
    }

    for (const file of files) {
      const filename = file.originalname?.toLowerCase() || '';
      if (!filename.endsWith('.csv')) {
        return Promise.reject(EvaluationErrEnum.fileMustBeCSV);
      }
    }

    const { collectionId, name, description, enableQualityEvaluation, evaluationModel } = data;

    if (!collectionId && name === undefined) {
      return Promise.reject(CommonErrEnum.missingParams);
    }
    if (collectionId && name !== undefined) {
      return Promise.reject(CommonErrEnum.invalidParams);
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

    let teamId: string;
    let tmbId: string;
    let targetCollectionId: string;
    let datasetCollection: any;

    if (collectionId) {
      // Mode 1: Use existing collection
      const authResult = await authEvaluationDatasetDataWrite(collectionId, {
        req,
        authToken: true,
        authApiKey: true
      });
      teamId = authResult.teamId;
      tmbId = authResult.tmbId;
      targetCollectionId = collectionId;

      datasetCollection = await MongoEvalDatasetCollection.findById(collectionId);
      if (!datasetCollection) {
        return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
      }
      if (String(datasetCollection.teamId) !== teamId) {
        return Promise.reject(EvaluationErrEnum.evalInsufficientPermission);
      }
    } else {
      // Mode 2: Create new collection
      if (typeof name !== 'string' || name.trim().length === 0) {
        return Promise.reject(EvaluationErrEnum.evalNameRequired);
      }
      if (name.trim().length > MAX_NAME_LENGTH) {
        return Promise.reject(EvaluationErrEnum.evalNameTooLong);
      }
      if (description && typeof description !== 'string') {
        return Promise.reject(EvaluationErrEnum.evalDescriptionInvalidType);
      }
      if (description && description.length > MAX_DESCRIPTION_LENGTH) {
        return Promise.reject(EvaluationErrEnum.evalDescriptionTooLong);
      }

      const authResult = await authEvaluationDatasetCreate({
        req,
        authToken: true,
        authApiKey: true
      });
      teamId = authResult.teamId;
      tmbId = authResult.tmbId;

      // Check evaluation dataset limit
      await checkTeamEvalDatasetLimit(teamId);

      // Check for duplicate collection name
      const existingCollection = await MongoEvalDatasetCollection.findOne({
        teamId,
        name: name!.trim()
      });
      if (existingCollection) {
        return Promise.reject(EvaluationErrEnum.evalDuplicateDatasetName);
      }

      // Create new collection
      const defaultEvaluationModel = getDefaultEvaluationModel();
      const evaluationModelToUse = evaluationModel || defaultEvaluationModel?.model;

      const collectionData = await mongoSessionRun(async (session) => {
        const [collection] = await MongoEvalDatasetCollection.create(
          [
            {
              teamId,
              tmbId,
              name: name!.trim(),
              description: (description || '').trim(),
              evaluationModel: evaluationModelToUse
            }
          ],
          { session, ordered: true }
        );
        return collection;
      });

      datasetCollection = collectionData;
      targetCollectionId = String(collectionData._id);
    }

    // Check AI points if quality evaluation is enabled
    if (enableQualityEvaluation && evaluationModel) {
      await checkTeamAIPoints(teamId);
    }

    // Process all CSV files
    let allEvalDatasetRecords: any[] = [];
    let totalRows = 0;

    for (const file of files) {
      const fs = require('fs');

      // Validate file path to prevent directory traversal attacks
      const safePath = validateFilePath(file.path);
      const rawText = fs.readFileSync(safePath, 'utf8');

      const csvRows = parseCSVContent(rawText);

      if (csvRows.length === 0) {
        continue; // Skip empty files
      }

      totalRows += csvRows.length;

      // Convert CSV rows to dataset records
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
            metadataObj = {};
          }
        }

        return {
          teamId,
          tmbId,
          evalDatasetCollectionId: targetCollectionId,
          [EvalDatasetDataKeyEnum.UserInput]: row.user_input,
          [EvalDatasetDataKeyEnum.ExpectedOutput]: row.expected_output,
          [EvalDatasetDataKeyEnum.ActualOutput]: row.actual_output || '',
          [EvalDatasetDataKeyEnum.Context]: contextArray,
          [EvalDatasetDataKeyEnum.RetrievalContext]: retrievalContextArray,
          qualityMetadata: {
            ...(enableQualityEvaluation
              ? {}
              : { status: EvalDatasetDataQualityStatusEnum.unevaluated })
          },
          createFrom: EvalDatasetDataCreateFromEnum.fileImport
        };
      });

      allEvalDatasetRecords.push(...evalDatasetRecords);
    }

    // Validate total row count
    if (totalRows === 0) {
      return Promise.reject(EvaluationErrEnum.csvNoDataRows);
    }
    if (totalRows > MAX_CSV_ROWS) {
      return Promise.reject(EvaluationErrEnum.csvTooManyRows);
    }

    // Insert all records
    const insertedRecords = await mongoSessionRun(async (session) => {
      return await MongoEvalDatasetData.insertMany(allEvalDatasetRecords, {
        session,
        ordered: false
      });
    });

    // Queue quality evaluation jobs if enabled
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
    if (error.message && typeof error.message === 'string') {
      return Promise.reject(EvaluationErrEnum.csvParsingError);
    }
    throw error;
  } finally {
    removeFilesByPaths(filePaths);
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;

export const config = {
  api: {
    bodyParser: false
  }
};
