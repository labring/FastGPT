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

export type exportItemsBody = {};

export type exportItemsResponse = {};

async function handler(
  req: ApiRequestProps<exportItemsBody, exportItemsQuery>,
  res: ApiResponseType<any>
) {
  const { evalId, appId } = req.query;

  const { teamId, tmbId, app } = await authApp({
    req,
    authToken: true,
    authApiKey: true,
    per: ManagePermissionVal,
    appId
  });

  console.log(evalId);
  const evaluation = await MongoEvaluation.findById(evalId);
  if (!evaluation) {
    return Promise.reject('评估任务不存在');
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

  write(`\uFEFF问题,标准答案,实际回答,状态,准确度,相关度,语义准确度,总分`);

  // 处理每一条数据
  cursor.on('data', (doc) => {
    // 处理CSV中的特殊字符，特别是双引号和逗号
    const question = doc.question?.replace(/"/g, '""') || '';
    const expectedResponse = doc.expectedResponse?.replace(/"/g, '""') || '';
    const response = doc.response?.replace(/"/g, '""') || '';

    // 状态转换为可读文本
    let status = '';
    switch (doc.status) {
      case 0:
        status = '待处理';
        break;
      case 1:
        status = '处理中';
        break;
      case 2:
        status = '已完成';
        break;
      default:
        status = '未知';
    }

    const accuracy = !!doc.accuracy ? doc.accuracy.toFixed(2) : '0';
    const relevance = !!doc.relevance ? doc.relevance.toFixed(2) : '0';
    const semanticAccuracy = !!doc.semanticAccuracy ? doc.semanticAccuracy.toFixed(2) : '0';
    const score = !!doc.score ? doc.score.toFixed(2) : '0';

    write(
      `\n"${question}","${expectedResponse}","${response}","${status}","${accuracy}","${relevance}","${semanticAccuracy}","${score}"`
    );
  });

  // 数据读取完成时关闭游标和响应
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

  // 处理错误
  cursor.on('error', (err) => {
    addLog.error('导出评估项目错误', { error: err, evalId });
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
