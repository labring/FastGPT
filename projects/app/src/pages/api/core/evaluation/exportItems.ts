import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEvaluation } from '@fastgpt/service/core/evaluation/evalSchema';
import { MongoEvalItem } from '@fastgpt/service/core/evaluation/evalItemSchema';
import { Types } from 'mongoose';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { authEval } from '@fastgpt/service/support/permission/evaluation/auth';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { generateCsv } from '@fastgpt/service/common/file/csv';

export type exportItemsQuery = {
  evalId: string;
};

export type exportItemsBody = {
  title: string;
  statusMap: Record<string, { label: string }>;
};

async function handler(
  req: ApiRequestProps<exportItemsBody, exportItemsQuery>,
  res: ApiResponseType<any>
) {
  const { evalId } = req.query;
  const { title, statusMap } = req.body || {};

  const { teamId, tmbId } = await authEval({
    req,
    per: ReadPermissionVal,
    evalId,
    authToken: true,
    authApiKey: true
  });

  const evaluation = await MongoEvaluation.findById(evalId);
  if (!evaluation) {
    return Promise.reject('Evaluation task does not exist');
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8;');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=${encodeURIComponent(evaluation?.name || 'evaluation')}.csv;`
  );

  const evalItems = await MongoEvalItem.find(
    {
      evalId: new Types.ObjectId(evalId)
    },
    'globalVariables question expectedResponse response status accuracy relevance semanticAccuracy score errorMessage',
    {
      ...readFromSecondary
    }
  );

  const allVariableKeys = new Set<string>();
  evalItems.forEach((doc) => {
    if (doc.globalVariables) {
      Object.keys(doc.globalVariables).forEach((key) => allVariableKeys.add(key));
    }
  });
  const variableKeysArray = Array.from(allVariableKeys).sort();

  const baseHeaders = title.split(',');
  const headers = [...variableKeysArray, ...baseHeaders];

  const data = evalItems.map((doc) => {
    const question = doc.question || '';
    const expectedResponse = doc.expectedResponse || '';
    const response = doc.response || '';

    const status = (() => {
      if (doc.errorMessage) {
        return 'Error'; // Show error when errorMessage exists
      }
      return statusMap[doc.status]?.label || 'Unknown';
    })();

    const score = !!doc.score ? doc.score.toFixed(2) : '0';

    const variableValues = variableKeysArray.map((key) => {
      return doc.globalVariables?.[key] || '';
    });

    return [...variableValues, question, expectedResponse, response, status, score];
  });

  const csvContent = generateCsv(headers, data);

  res.write('\uFEFF' + csvContent);

  addAuditLog({
    tmbId,
    teamId,
    event: AuditEventEnum.EXPORT_EVALUATION,
    params: {
      name: evaluation.name
    }
  });

  res.end();
}

export default NextAPI(handler);

export const config = {
  api: {
    responseLimit: '100mb'
  }
};
