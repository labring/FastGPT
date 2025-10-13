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
import {
  addEvalDatasetDataQualityBulk,
  checkEvalDatasetDataQualityQueueHealth
} from '@fastgpt/service/core/evaluation/dataset/dataQualityMq';
import { addLog } from '@fastgpt/service/common/system/log';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import {
  authEvaluationDatasetDataWrite,
  authEvaluationDatasetCreate
} from '@fastgpt/service/core/evaluation/common';
import { MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH } from '@fastgpt/global/core/evaluation/constants';
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
import { parseCSVContent } from '@fastgpt/service/core/evaluation/dataset/csvUtils';

export type EvalDatasetImportFromFileQuery = {};
export type EvalDatasetImportFromFileBody = importEvalDatasetFromFileBody;
export type EvalDatasetImportFromFileResponse = string;

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

async function authenticateExistingCollection(collectionId: string, req: NextApiRequest) {
  const authResult = await authEvaluationDatasetDataWrite(collectionId, {
    req,
    authToken: true,
    authApiKey: true
  });

  return {
    teamId: authResult.teamId,
    tmbId: authResult.tmbId,
    targetCollectionId: collectionId
  };
}

async function authenticateNewCollection(req: NextApiRequest) {
  const authResult = await authEvaluationDatasetCreate({
    req,
    authToken: true,
    authApiKey: true
  });

  return {
    teamId: authResult.teamId,
    tmbId: authResult.tmbId
  };
}

async function validateCollectionAccess(datasetCollection: any, teamId: string) {
  if (!datasetCollection) {
    return Promise.reject(EvaluationErrEnum.datasetCollectionNotFound);
  }
  if (String(datasetCollection.teamId) !== teamId) {
    return Promise.reject(EvaluationErrEnum.evalInsufficientPermission);
  }
}

async function validateNewCollectionParams(
  name: string | undefined,
  description: string | undefined
) {
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
}

async function validateCollectionName(teamId: string, name: string) {
  const existingCollection = await MongoEvalDatasetCollection.findOne({
    teamId,
    name: name.trim()
  });

  if (existingCollection) {
    return Promise.reject(EvaluationErrEnum.evalDuplicateDatasetName);
  }
}

async function getExistingCollection(collectionId: string) {
  const datasetCollection = await MongoEvalDatasetCollection.findById(collectionId);
  return datasetCollection;
}

async function createNewCollection(
  teamId: string,
  tmbId: string,
  name: string,
  description: string | undefined,
  evaluationModel: string | undefined
) {
  const defaultEvaluationModel = getDefaultEvaluationModel();
  const evaluationModelToUse = evaluationModel || defaultEvaluationModel?.model;

  const collectionData = await mongoSessionRun(async (session) => {
    const [collection] = await MongoEvalDatasetCollection.create(
      [
        {
          teamId,
          tmbId,
          name: name.trim(),
          description: (description || '').trim(),
          evaluationModel: evaluationModelToUse
        }
      ],
      { session, ordered: true }
    );
    return collection;
  });

  return {
    datasetCollection: collectionData,
    targetCollectionId: String(collectionData._id)
  };
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
      return Promise.reject(EvaluationErrEnum.fileRequired);
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
      const authResult = await authenticateExistingCollection(collectionId, req);
      teamId = authResult.teamId;
      tmbId = authResult.tmbId;
      targetCollectionId = authResult.targetCollectionId;

      datasetCollection = await getExistingCollection(collectionId);
      await validateCollectionAccess(datasetCollection, teamId);
    } else {
      // Mode 2: Create new collection (will be created after CSV validation)
      await validateNewCollectionParams(name, description);

      const authResult = await authenticateNewCollection(req);
      teamId = authResult.teamId;
      tmbId = authResult.tmbId;

      await checkTeamEvalDatasetLimit(teamId);
      await validateCollectionName(teamId, name!);

      datasetCollection = null;
      targetCollectionId = '';
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

      try {
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
          // Validate required fields exist
          if (!row.user_input || typeof row.user_input !== 'string') {
            throw new Error(`Invalid or missing user_input in CSV row`);
          }
          if (!row.expected_output || typeof row.expected_output !== 'string') {
            throw new Error(`Invalid or missing expected_output in CSV row`);
          }

          let contextArray: string[] = [];
          let retrievalContextArray: string[] = [];

          if (row.context !== undefined && row.context) {
            try {
              const parsed = JSON.parse(row.context);
              if (Array.isArray(parsed)) {
                contextArray = parsed.filter((item) => typeof item === 'string');
              } else if (typeof parsed === 'string') {
                contextArray = [parsed];
              }
            } catch (jsonError) {
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
            } catch (jsonError) {
              retrievalContextArray = [row.retrieval_context];
            }
          }

          try {
            const record = {
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
                  ? { status: EvalDatasetDataQualityStatusEnum.queuing }
                  : { status: EvalDatasetDataQualityStatusEnum.unevaluated })
              },
              createFrom: EvalDatasetDataCreateFromEnum.fileImport
            };

            if (!record[EvalDatasetDataKeyEnum.UserInput]?.trim()) {
              throw new Error(`Empty user_input field in CSV row`);
            }
            if (!record[EvalDatasetDataKeyEnum.ExpectedOutput]?.trim()) {
              throw new Error(`Empty expected_output field in CSV row`);
            }
            return record;
          } catch (recordError) {
            throw new Error(
              `Invalid record data: ${recordError instanceof Error ? recordError.message : 'Unknown error'}`
            );
          }
        });

        allEvalDatasetRecords.push(...evalDatasetRecords);
      } catch (error) {
        addLog.error('Error during CSV import:', {
          fileName: file.originalname || file.filename,
          error
        });
        return Promise.reject(EvaluationErrEnum.csvParsingError);
      }
    }

    // Validate total row count
    if (totalRows === 0) {
      return Promise.reject(EvaluationErrEnum.csvNoDataRows);
    }

    if (!collectionId) {
      const collectionResult = await createNewCollection(
        teamId,
        tmbId,
        name!,
        description,
        evaluationModel
      );
      datasetCollection = collectionResult.datasetCollection;
      targetCollectionId = collectionResult.targetCollectionId;

      allEvalDatasetRecords = allEvalDatasetRecords.map((record) => ({
        ...record,
        evalDatasetCollectionId: targetCollectionId
      }));
    }

    if (enableQualityEvaluation) {
      await checkEvalDatasetDataQualityQueueHealth();
    }

    // Insert all records
    const insertedRecords = await mongoSessionRun(async (session) => {
      return await MongoEvalDatasetData.insertMany(allEvalDatasetRecords, {
        session,
        ordered: true
      });
    });

    // Queue quality evaluation jobs if enabled
    if (enableQualityEvaluation && evaluationModel) {
      const qualityJobsData = insertedRecords.map((record) => ({
        dataId: record._id.toString(),
        evaluationModel: evaluationModel
      }));
      await addEvalDatasetDataQualityBulk(qualityJobsData);
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
  } catch (error) {
    addLog.error('API Eval Dataset Import From File error:', error);
    return Promise.reject(error);
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
