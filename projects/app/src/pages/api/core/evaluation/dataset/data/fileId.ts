import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '@fastgpt/service/core/evaluation/evalDatasetDataSchema';
import { EvalDatasetDataCreateFromEnum } from '@fastgpt/global/core/evaluation/constants';
import { readFileContentFromMongo } from '@fastgpt/service/common/file/gridfs/controller';
import { authCollectionFile } from '@fastgpt/service/support/permission/auth/file';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import type { importEvalDatasetFromFileBody } from '@fastgpt/global/core/evaluation/api';
import { addEvalDatasetDataQualityJob } from '@fastgpt/service/core/evaluation/dataQualityMq';

export type EvalDatasetImportFromFileQuery = {};
export type EvalDatasetImportFromFileBody = importEvalDatasetFromFileBody;
export type EvalDatasetImportFromFileResponse = string;

const REQUIRED_CSV_COLUMNS = ['user_input', 'expected_output'] as const;

const OPTIONAL_CSV_COLUMNS = ['actual_output', 'context', 'retrieval_context', 'metadata'] as const;

const CSV_COLUMNS = [...REQUIRED_CSV_COLUMNS, ...OPTIONAL_CSV_COLUMNS] as const;

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

function parseCSVContent(csvContent: string): CSVRow[] {
  const lines = csvContent.split('\n').filter((line) => line.trim());

  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map((h) => h.replace(/^"|"$/g, ''));

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
  req: ApiRequestProps<EvalDatasetImportFromFileBody, EvalDatasetImportFromFileQuery>
): Promise<EvalDatasetImportFromFileResponse> {
  const {
    fileId,
    collectionId: datasetCollectionId,
    enableQualityEvaluation,
    qualityEvaluationModel
  } = req.body;

  if (!fileId || typeof fileId !== 'string') {
    return 'fileId is required and must be a string';
  }

  if (!datasetCollectionId || typeof datasetCollectionId !== 'string') {
    return 'datasetCollectionId is required and must be a string';
  }

  if (typeof enableQualityEvaluation !== 'boolean') {
    return 'enableQualityEvaluation is required and must be a boolean';
  }

  if (
    enableQualityEvaluation &&
    (!qualityEvaluationModel || typeof qualityEvaluationModel !== 'string')
  ) {
    return 'qualityEvaluationModel is required when enableQualityEvaluation is true';
  }

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: WritePermissionVal
  });

  const { file } = await authCollectionFile({
    req,
    authToken: true,
    authApiKey: true,
    fileId,
    per: WritePermissionVal
  });

  const filename = file.filename?.toLowerCase() || '';
  if (!filename.endsWith('.csv')) {
    return 'File must be a CSV file';
  }

  // Verify dataset collection exists and belongs to team
  const datasetCollection = await MongoEvalDatasetCollection.findById(datasetCollectionId);
  if (!datasetCollection) {
    return 'Evaluation dataset collection not found';
  }

  if (String(datasetCollection.teamId) !== teamId) {
    return 'No permission to access this dataset collection';
  }

  try {
    // Read and parse CSV file
    const { rawText } = await readFileContentFromMongo({
      teamId,
      tmbId,
      bucketName: BucketNameEnum.dataset,
      fileId,
      getFormatText: false
    });

    const csvRows = parseCSVContent(rawText);

    if (csvRows.length === 0) {
      return 'CSV file contains no data rows';
    }

    // Validate row limit (prevent memory issues)
    if (csvRows.length > 10000) {
      return 'CSV file cannot contain more than 10,000 rows';
    }

    // Prepare data for bulk insert
    const evalDatasetRecords = csvRows.map((row) => {
      // Parse context arrays
      let contextArray: string[] = [];
      let retrievalContextArray: string[] = [];
      let metadataObj: Record<string, any> = {};

      // Parse context (optional)
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

      // Parse retrieval_context (optional)
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

      // Parse metadata (optional)
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
        datasetId: datasetCollectionId,
        user_input: row.user_input,
        expected_output: row.expected_output,
        actual_output: row.actual_output || '',
        context: contextArray,
        retrieval_context: retrievalContextArray,
        metadata: metadataObj,
        createFrom: EvalDatasetDataCreateFromEnum.fileImport
      };
    });

    // Bulk insert evaluation dataset data and get inserted documents
    const insertedRecords = await mongoSessionRun(async (session) => {
      return await MongoEvalDatasetData.insertMany(evalDatasetRecords, {
        session,
        ordered: false // Continue if some documents fail
      });
    });

    // Add to quality evaluation queue if enabled
    if (enableQualityEvaluation && qualityEvaluationModel) {
      const evaluationJobs = insertedRecords.map((record) =>
        addEvalDatasetDataQualityJob({
          dataId: record._id.toString(),
          evalModel: qualityEvaluationModel
        })
      );
      await Promise.allSettled(evaluationJobs);
    }

    // TODO: Add audit log for import operation
    // TODO: Add tracking for import metrics

    return 'success';
  } catch (error: any) {
    // Handle parsing errors
    if (error.message && typeof error.message === 'string') {
      return `CSV parsing error: ${error.message}`;
    }

    // Re-throw other errors
    throw error;
  }
}

export default NextAPI(handler);

// Export handler for testing
export const handler_test = process.env.NODE_ENV === 'test' ? handler : undefined;
