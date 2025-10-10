import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authEvaluationTaskRead } from '@fastgpt/service/core/evaluation/common';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type { ExportEvaluationItemsRequest } from '@fastgpt/global/core/evaluation/api';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { sanitizeCsvField } from '@fastgpt/service/common/file/csv';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { addLog } from '@fastgpt/service/common/system/log';
import { MongoEvalItem } from '@fastgpt/service/core/evaluation/task/schema';
import { Types } from 'mongoose';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { responseWriteController } from '@fastgpt/service/common/response';

const PAGE_SIZE = 500;

const buildExportPipeline = (
  evalId: string,
  evaluation: any,
  filters: NonNullable<ExportEvaluationItemsRequest['filters']>
) => {
  const matchConditions: Record<string, any> = {
    evalId: new Types.ObjectId(evalId)
  };

  if (filters.status) {
    matchConditions.status = filters.status;
  }

  const searchConditions: any[] = [];
  const userInput = filters.userInput?.trim();
  if (userInput) {
    searchConditions.push({
      'dataItem.userInput': { $regex: new RegExp(replaceRegChars(userInput), 'i') }
    });
  }
  const expectedOutput = filters.expectedOutput?.trim();
  if (expectedOutput) {
    searchConditions.push({
      'dataItem.expectedOutput': { $regex: new RegExp(replaceRegChars(expectedOutput), 'i') }
    });
  }
  const actualOutput = filters.actualOutput?.trim();
  if (actualOutput) {
    searchConditions.push({
      'targetOutput.actualOutput': { $regex: new RegExp(replaceRegChars(actualOutput), 'i') }
    });
  }

  if (searchConditions.length > 0) {
    matchConditions.$and = searchConditions;
  }

  const pipeline: any[] = [{ $match: matchConditions }];

  if (filters.belowThreshold) {
    const evaluators = evaluation.evaluators || [];
    if (evaluators.length > 0) {
      const failChecks =
        (EvaluationTaskService as any).buildEvaluatorFailChecks?.(evaluators) || [];
      if (failChecks.length > 0) {
        pipeline.push({
          $addFields: {
            hasFailedEvaluator: { $or: failChecks }
          }
        });
        pipeline.push({
          $match: {
            hasFailedEvaluator: true,
            status: EvaluationStatusEnum.completed,
            evaluatorOutputs: { $exists: true, $ne: null, $not: { $size: 0 } }
          }
        });
      }
    }
  }

  pipeline.push(
    { $sort: { createTime: 1 } },
    {
      $project: {
        _id: 1,
        evalId: 1,
        dataItem: 1,
        targetOutput: 1,
        evaluatorOutputs: 1,
        status: 1,
        createTime: 1,
        updateTime: 1,
        finishTime: 1,
        errorMessage: 1
      }
    }
  );

  return pipeline;
};

const defaultHeaders = {
  itemId: 'Item ID',
  userInput: 'Question',
  expectedOutput: 'Expected Answer',
  actualOutput: 'Actual Answer',
  status: 'Status',
  errorMessage: 'Error'
};

async function handler(req: ApiRequestProps<ExportEvaluationItemsRequest>, res: NextApiResponse) {
  const {
    evalId,
    headers = {},
    metricColumns = [],
    statusLabelMap = {},
    filters = {}
  } = req.body || {};

  if (!evalId) {
    throw new Error(EvaluationErrEnum.evalIdRequired);
  }

  const { teamId, tmbId, evaluation } = await authEvaluationTaskRead(evalId, {
    req,
    authApiKey: true,
    authToken: true
  });

  const resolvedHeaders = {
    ...defaultHeaders,
    ...headers
  };

  const exportFilters: NonNullable<ExportEvaluationItemsRequest['filters']> = {};
  if (filters.status) {
    exportFilters.status = filters.status;
  }
  if (filters.belowThreshold) {
    exportFilters.belowThreshold = filters.belowThreshold;
  }
  if (filters.userInput) {
    exportFilters.userInput = filters.userInput;
  }
  if (filters.expectedOutput) {
    exportFilters.expectedOutput = filters.expectedOutput;
  }
  if (filters.actualOutput) {
    exportFilters.actualOutput = filters.actualOutput;
  }

  const pipeline = buildExportPipeline(evalId, evaluation, exportFilters);
  const cursor = MongoEvalItem.aggregate(pipeline, {
    ...readFromSecondary,
    allowDiskUse: true
  }).cursor({ batchSize: PAGE_SIZE });

  let exportedCount = 0;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8;');
  res.setHeader('Content-Disposition', `attachment; filename=evaluation-${evalId}.csv;`);

  const write = responseWriteController({
    res,
    readStream: cursor
  });

  const headerRow = [
    sanitizeCsvField(resolvedHeaders.itemId),
    sanitizeCsvField(resolvedHeaders.userInput),
    sanitizeCsvField(resolvedHeaders.expectedOutput),
    sanitizeCsvField(resolvedHeaders.actualOutput),
    ...metricColumns.map((column) => sanitizeCsvField(column.label)),
    sanitizeCsvField(resolvedHeaders.status),
    sanitizeCsvField(resolvedHeaders.errorMessage)
  ].join(',');

  write(`\uFEFF${headerRow}`);

  cursor.on('data', (doc: any) => {
    const metricScoreMap = new Map<string, number>();
    (doc.evaluatorOutputs || []).forEach((output: any) => {
      const name = output?.data?.metricName;
      const score = output?.data?.score;
      if (name) {
        metricScoreMap.set(name, score);
      }
    });

    const row = [
      sanitizeCsvField(doc._id?.toString() || ''),
      sanitizeCsvField(doc.dataItem?.userInput || ''),
      sanitizeCsvField(doc.dataItem?.expectedOutput || ''),
      sanitizeCsvField(doc.targetOutput?.actualOutput || ''),
      ...metricColumns.map((column) => {
        const value = metricScoreMap.get(column.key);
        return sanitizeCsvField(value !== undefined && value !== null ? String(value) : '');
      }),
      sanitizeCsvField(statusLabelMap[doc.status as EvaluationStatusEnum] || doc.status || ''),
      sanitizeCsvField(doc.errorMessage || '')
    ].join(',');

    write(`\n${row}`);
    exportedCount += 1;
  });

  cursor.on('end', () => {
    cursor.close();
    res.end();
    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.EXPORT_EVALUATION_TASK_ITEMS,
        params: {
          taskName: evaluation.name,
          format: 'csv',
          itemCount: exportedCount
        }
      });
    })();
  });

  cursor.on('error', (error) => {
    addLog.error('Export evaluation items failed', error);
    cursor.close();
    if (!res.headersSent) {
      res.status(500);
    }
    res.end();
  });
}

export default NextAPI(handler);
export { handler };

export const config = {
  api: {
    responseLimit: false
  }
};
