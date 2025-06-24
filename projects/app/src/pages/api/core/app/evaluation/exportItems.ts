import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import { MongoEvalItem } from '@fastgpt/service/core/app/evaluation/evalItemSchema';
import { Types } from 'mongoose';
import { addLog } from '@fastgpt/service/common/system/log';
import { responseWriteController } from '@fastgpt/service/common/response';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

export type exportItemsQuery = {
  evalId: string;
  appId: string;
};

export type exportItemsBody = {
  title: string;
  statusMap: Record<string, { label: string }>;
};

export type exportItemsResponse = {};

async function handler(
  req: ApiRequestProps<exportItemsBody, exportItemsQuery>,
  res: ApiResponseType<any>
) {
  const { evalId, appId } = req.query;
  const { title, statusMap } = req.body || {};

  const { teamId, tmbId, app } = await authApp({
    req,
    authToken: true,
    authApiKey: true,
    per: ManagePermissionVal,
    appId
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

  const cursor = MongoEvalItem.find(
    {
      evalId: new Types.ObjectId(evalId)
    },
    'question expectedResponse response status accuracy relevance semanticAccuracy score',
    {
      ...readFromSecondary
    }
  ).cursor();

  const write = responseWriteController({
    res,
    readStream: cursor
  });

  write(`\uFEFF${title}`);

  cursor.on('data', (doc) => {
    const question = doc.question?.replace(/"/g, '""') || '';
    const expectedResponse = doc.expectedResponse?.replace(/"/g, '""') || '';
    const response = doc.response?.replace(/"/g, '""') || '';

    const status = (() => {
      if (doc.errorMessage) {
        return statusMap.error?.label || 'Error';
      }
      return statusMap[doc.status]?.label || 'Unknown';
    })();

    const accuracy = !!doc.accuracy ? doc.accuracy.toFixed(2) : '0';
    const relevance = !!doc.relevance ? doc.relevance.toFixed(2) : '0';
    const semanticAccuracy = !!doc.semanticAccuracy ? doc.semanticAccuracy.toFixed(2) : '0';
    const score = !!doc.score ? doc.score.toFixed(2) : '0';

    write(
      `\n"${question}","${expectedResponse}","${response}","${status}","${accuracy}","${relevance}","${semanticAccuracy}","${score}"`
    );
  });

  cursor.on('end', () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.EXPORT_EVALUATION,
      params: {
        appName: app.name,
        appType: getI18nAppType(app.type)
      }
    });
    cursor.close();
    res.end();
  });

  cursor.on('error', (err) => {
    addLog.error('Error exporting evaluation items', { error: err, evalId });
    res.status(500);
    res.end();
  });
}

export default NextAPI(handler);

export const config = {
  api: {
    responseLimit: '100mb'
  }
};
