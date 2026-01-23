/**
 * Mock implementation for evaluation dataset generation
 *
 * Provides XLSX file-based evaluation dataset generation for testing and development.
 * Uses node-xlsx to parse Excel files with evaluation data.
 *
 * XLSX file format:
 * - Required columns: userInput, expectedContextIds
 * - Optional columns: expectedOutput (not used in rerank evaluation, can be empty)
 * - expectedContextIds: MongoDB ObjectIDs in one of these formats:
 *   1. Comma-separated: "id1,id2,id3" or "id1, id2, id3"
 *   2. Array string: "['id1','id2']" or "[id1,id2]"
 *   3. Space-separated: "id1 id2 id3"
 *   4. Single ID: "id1"
 *
 * Example XLSX:
 * | userInput | expectedOutput | expectedContextIds |
 * |-----------|---------------|-------------------|
 * | What is FastGPT? | FastGPT is an AI platform | ['56beb4343aeaaa14008c925b'] |
 * | How to use? | Follow the guide | 56beb4343aeaaa14008c925b,56beb4343aeaaa14008c925c |
 *
 * Note: expectedOutput column is optional and not used in rerank evaluation
 */

import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { MongoApp } from '../../../../../core/app/schema';
import { MongoEvalDatasetCollection } from '../../../../../core/evaluation/dataset/evalDatasetCollectionSchema';
import { MongoEvalDatasetData } from '../../../../../core/evaluation/dataset/evalDatasetDataSchema';
import {
  EvalDatasetDataCreateFromEnum,
  EvalDatasetDataKeyEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';
import { extractModelFromApp, pLimit } from '../../utils';
import { addLog } from '../../../../../common/system/log';
import { performDatasetSearch } from '../helpers/dataset-search';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { getDefaultLLMModel } from '../../../../ai/model';
import { createEnhancedError } from '../../utils';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { TrainTaskUnrecoverableError } from '../errors';
import { DEFAULT_DITING_CONCURRENCY, MAX_DITING_CONCURRENCY } from '../../constants';
import xlsx from 'node-xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { Types } from 'mongoose';

/**
 * XLSX row structure
 */
interface XLSXEvalDataRow {
  userInput: string;
  expectedOutput?: string; // Optional - not used in rerank evaluation
  expectedContextIds: string[]; // Parsed array of MongoDB ObjectIDs
}

/**
 * Parse XLSX file and extract evaluation data
 *
 * @param filePath - Path to XLSX file
 * @returns Array of evaluation data items
 * @throws Error if file not found, invalid format, or missing required columns
 */
function parseXLSXEvalData(filePath: string): XLSXEvalDataRow[] {
  addLog.info('[MOCK] Parsing XLSX eval dataset file', { filePath });

  // Check file existence
  if (!fs.existsSync(filePath)) {
    throw new Error(`XLSX file not found: ${filePath}`);
  }

  // Read XLSX file using node-xlsx
  const buffer = fs.readFileSync(filePath);
  const sheets = xlsx.parse(buffer);

  if (sheets.length === 0) {
    throw new Error('XLSX file has no sheets');
  }

  // Get first sheet
  const sheet = sheets[0];
  const data = sheet.data;

  if (data.length === 0) {
    throw new Error('XLSX file is empty');
  }

  // First row is header
  const header = data[0].map((cell: any) => String(cell).trim());
  const rows = data.slice(1);

  if (rows.length === 0) {
    throw new Error('XLSX file has no data rows (only header)');
  }

  addLog.info('[MOCK] XLSX file parsed', {
    sheetName: sheet.name,
    rowCount: rows.length,
    columns: header
  });

  // Validate required columns (expectedOutput is optional for rerank evaluation)
  const requiredColumns = ['userInput', 'expectedContextIds'];
  const optionalColumns = ['expectedOutput'];
  const columnIndexes: Record<string, number> = {};

  requiredColumns.forEach((col) => {
    const index = header.indexOf(col);
    if (index === -1) {
      throw new Error(
        `Missing required column in XLSX: ${col}. Available columns: ${header.join(', ')}`
      );
    }
    columnIndexes[col] = index;
  });

  // Add optional columns if present
  optionalColumns.forEach((col) => {
    const index = header.indexOf(col);
    if (index !== -1) {
      columnIndexes[col] = index;
    }
  });

  // Transform and validate each row
  const evalData: XLSXEvalDataRow[] = rows
    .filter((row: any[]) => row && row.length > 0)
    .map((row: any[], index: number) => {
      const userInput = String(row[columnIndexes.userInput] || '').trim();
      const expectedOutput =
        columnIndexes.expectedOutput !== undefined
          ? String(row[columnIndexes.expectedOutput] || '').trim()
          : undefined;
      const expectedContextIds = String(row[columnIndexes.expectedContextIds] || '').trim();

      // Validate required fields
      if (!userInput) {
        throw new Error(`Row ${index + 2}: userInput is required`);
      }
      if (!expectedContextIds) {
        throw new Error(`Row ${index + 2}: expectedContextIds is required`);
      }

      // Validate expectedContextIds format
      // Support multiple formats:
      // 1. Comma-separated: "id1,id2,id3" or "id1, id2, id3"
      // 2. Array string: "['id1','id2']" or "['id1', 'id2']" or "[id1,id2]"
      // 3. Space-separated: "id1 id2 id3"
      let contextIds: string[];

      if (expectedContextIds.startsWith('[') && expectedContextIds.endsWith(']')) {
        // Array string format: "['id1','id2']" or "[id1,id2]"
        try {
          // Remove brackets and parse
          const innerContent = expectedContextIds.slice(1, -1).trim();
          // Split by comma and clean up quotes and whitespace
          contextIds = innerContent
            .split(',')
            .map((id) => id.trim().replace(/^['"]|['"]$/g, ''))
            .filter((id) => id.length > 0);
        } catch (error) {
          throw new Error(
            `Row ${index + 2}: Failed to parse array format in expectedContextIds: ${expectedContextIds}. ` +
              `Expected format: ['id1','id2'] or [id1,id2]`
          );
        }
      } else if (expectedContextIds.includes(',')) {
        // Comma-separated format: "id1,id2,id3"
        contextIds = expectedContextIds.split(',').map((id) => id.trim());
      } else if (expectedContextIds.includes(' ')) {
        // Space-separated format: "id1 id2 id3"
        contextIds = expectedContextIds.split(/\s+/).filter((id) => id.length > 0);
      } else {
        // Single ID
        contextIds = [expectedContextIds];
      }

      // Validate all IDs are valid MongoDB ObjectIDs
      const invalidIds = contextIds.filter((id) => !Types.ObjectId.isValid(id));

      if (invalidIds.length > 0) {
        throw new Error(
          `Row ${index + 2}: Invalid MongoDB ObjectID format in expectedContextIds: ${invalidIds.join(', ')}. ` +
            `Expected 24-character hexadecimal strings. ` +
            `Parsed IDs: [${contextIds.join(', ')}]`
        );
      }

      return {
        userInput,
        expectedOutput,
        expectedContextIds: contextIds
      };
    });

  addLog.info('[MOCK] XLSX validation completed', {
    validRows: evalData.length
  });

  return evalData;
}

/**
 * Mock implementation of runGenerateEvalDataset using XLSX file
 *
 * This function:
 * 1. Reads evaluation data from XLSX file
 * 2. Performs dataset search for each question (same logic as real implementation)
 * 3. Creates evaluation dataset collection
 * 4. Batch inserts evaluation data
 * 5. Returns evaluation dataset ID
 *
 * @param task - Rerank training task instance
 * @returns Evaluation dataset collection ID
 * @throws Error if XLSX file not found, invalid format, or database operation fails
 */
export async function mockRunGenerateEvalDataset(task: RerankTrainTaskSchemaType): Promise<string> {
  addLog.info('[MOCK] Run generate eval dataset from XLSX', { taskId: String(task._id) });

  // Get XLSX file path from environment variable
  const xlsxFilePath =
    process.env.EVAL_DATASET_MOCK_FILE || path.join(process.cwd(), 'mock-eval-dataset.xlsx');

  addLog.info('[MOCK] Using XLSX file', { xlsxFilePath });

  // Parse XLSX file
  let xlsxData: XLSXEvalDataRow[];
  try {
    xlsxData = parseXLSXEvalData(xlsxFilePath);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.evaluating,
      RerankTrainErrEnum.evalDatabaseSaveFailed,
      RerankTrainSuggestionEnum.evalDatabaseSaveFailed,
      `Failed to parse XLSX file: ${errorMsg}`
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Get app configuration (needed for dataset search)
  const app = await MongoApp.findById(task.appId).lean();
  if (!app) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.evaluating,
      RerankTrainErrEnum.evalAppDeleted,
      RerankTrainSuggestionEnum.evalAppDeleted
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Extract AI model name (for metadata)
  const aiModelName = extractModelFromApp(
    app,
    FlowNodeTypeEnum.chatNode,
    NodeInputKeyEnum.aiModel,
    getDefaultLLMModel
  );

  addLog.info('[MOCK] Performing dataset search for XLSX eval data', {
    taskId: String(task._id),
    itemCount: xlsxData.length
  });

  // Perform dataset search for each question (same logic as real implementation)
  const searchConcurrency = Math.min(
    Math.max(
      parseInt(process.env.DATASET_SEARCH_CONCURRENCY || String(DEFAULT_DITING_CONCURRENCY), 10),
      1
    ),
    MAX_DITING_CONCURRENCY
  );

  addLog.info('[MOCK] Dataset search concurrency configuration', {
    taskId: String(task._id),
    concurrency: searchConcurrency,
    totalItems: xlsxData.length
  });

  const searchLimit = pLimit(searchConcurrency);
  const searchResults = await Promise.allSettled(
    xlsxData.map((item) =>
      searchLimit(async () => {
        const retrievalResults = await performDatasetSearch(task, app, item.userInput);

        return {
          teamId: task.teamId,
          tmbId: task.tmbId,
          userInput: item.userInput,
          expectedOutput: item.expectedOutput,
          retrievalContextsFull: retrievalResults,
          expectedContextIds: item.expectedContextIds // Already parsed as array
        };
      })
    )
  );

  // Filter successful results
  const enrichedEvalDataItems = searchResults
    .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
    .map((result) => result.value);

  if (enrichedEvalDataItems.length === 0) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.evaluating,
      RerankTrainErrEnum.evalDitingGenerationFailed,
      RerankTrainSuggestionEnum.evalDitingGenerationFailed
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  addLog.info('[MOCK] Completed dataset search for XLSX eval data', {
    taskId: String(task._id),
    enrichedItemCount: enrichedEvalDataItems.length,
    failedCount: searchResults.length - enrichedEvalDataItems.length
  });

  // Create evaluation dataset collection
  const evalCollectionName = `Eval Dataset - Task ${task._id} (MOCK)`;

  try {
    const [evalCollection] = await MongoEvalDatasetCollection.create([
      {
        teamId: task.teamId,
        tmbId: task.tmbId,
        name: evalCollectionName,
        description: `[MOCK] Rerank Model Evaluation Dataset - Training Task ${task.name}`,
        metadata: {
          taskId: String(task._id),
          taskName: task.name,
          generatedAt: new Date(),
          sampleSize: enrichedEvalDataItems.length,
          mockSource: 'xlsx',
          xlsxFilePath
        }
      }
    ]);

    // Batch insert evaluation data
    const evalDataDocs = enrichedEvalDataItems.map((item) => ({
      teamId: item.teamId,
      tmbId: item.tmbId,
      evalDatasetCollectionId: evalCollection._id,
      [EvalDatasetDataKeyEnum.UserInput]: item.userInput,
      [EvalDatasetDataKeyEnum.ExpectedOutput]: item.expectedOutput,
      [EvalDatasetDataKeyEnum.Context]: [],
      [EvalDatasetDataKeyEnum.RetrievalContext]: [],
      [EvalDatasetDataKeyEnum.RetrievalContextsFull]: item.retrievalContextsFull,
      [EvalDatasetDataKeyEnum.ExpectedContextIds]: item.expectedContextIds,
      createFrom: EvalDatasetDataCreateFromEnum.manual,
      synthesisMetadata: {
        intelligentGenerationModel: aiModelName,
        generatedAt: new Date()
      }
    }));

    await MongoEvalDatasetData.insertMany(evalDataDocs);

    addLog.info('[MOCK] Generated eval dataset from XLSX', {
      taskId: String(task._id),
      datasetId: String(evalCollection._id),
      dataCount: evalDataDocs.length,
      xlsxFilePath
    });

    return String(evalCollection._id);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.evaluating,
      RerankTrainErrEnum.evalDatabaseSaveFailed,
      RerankTrainSuggestionEnum.evalDatabaseSaveFailed,
      `Failed to save evaluation dataset: ${errorMsg}`
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }
}
