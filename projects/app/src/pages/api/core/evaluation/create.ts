import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addLog } from '@fastgpt/service/common/system/log';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { readRawTextByLocalFile } from '@fastgpt/service/common/file/read/utils';
import { createEvaluationUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { MongoEvaluation } from '@fastgpt/service/core/evaluation/evalSchema';
import { MongoEvalItem } from '@fastgpt/service/core/evaluation/evalItemSchema';
import { addEvaluationJob } from '@fastgpt/service/core/evaluation/mq';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { validateEvaluationFile } from '@fastgpt/service/core/evaluation/utils';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { checkTeamHasRunningEvaluation } from '@fastgpt/service/core/evaluation/utils';

export type createEvaluationBody = {
  name: string;
  appId: string;
  evalModel: string;
};

const MAX_EVAL_ITEMS = process.env.EVAL_LINE_LIMIT ? Number(process.env.EVAL_LINE_LIMIT) : 1000;

async function handler(req: ApiRequestProps<createEvaluationBody, {}>, res: ApiResponseType<any>) {
  const filePaths: string[] = [];

  try {
    const upload = getUploadModel({
      maxSize: global.feConfigs?.uploadFileMaxSize
    });

    const { file, data } = await upload.getUploadFile<createEvaluationBody>(req, res);
    filePaths.push(file.path);

    if (file.mimetype !== 'text/csv') {
      return Promise.reject('File must be a CSV file');
    }

    const { teamId, tmbId, app } = await authApp({
      req,
      authToken: true,
      authApiKey: true,
      per: ReadPermissionVal,
      appId: data.appId
    });
    await checkTeamAIPoints(teamId);
    await checkTeamHasRunningEvaluation(teamId);

    const { rawText } = await readRawTextByLocalFile({
      teamId,
      tmbId,
      path: file.path,
      encoding: file.encoding,
      getFormatText: false
    });
    removeFilesByPaths(filePaths);

    const appVariables = app.chatConfig.variables;

    const { lines } = await validateEvaluationFile(rawText, appVariables);

    if (lines.length - 1 > MAX_EVAL_ITEMS) {
      return Promise.reject(`File must be less than ${MAX_EVAL_ITEMS} lines`);
    }

    const headers = lines[0].split(',');
    const qIndex = headers.findIndex((h) => h.trim() === '*q');
    const aIndex = headers.findIndex((h) => h.trim() === '*a');
    const historyIndex = headers.findIndex((h) => h.trim() === 'history');

    const { usageId } = await createEvaluationUsage({
      teamId,
      tmbId,
      appName: app.name,
      model: data.evalModel
    });

    const evalItems = lines.slice(1).map((line) => {
      const values = line.split(',');
      const question = values[qIndex];
      const expectedResponse = values[aIndex];
      const history = historyIndex !== -1 ? values[historyIndex] : '';

      const globalVariables = headers.slice(0, qIndex).reduce(
        (acc, header, j) => {
          const headerName = header.trim().replace(/^\*/, '');
          acc[headerName] = values[j] || '';
          return acc;
        },
        {} as Record<string, string>
      );

      return {
        question,
        expectedResponse,
        history,
        globalVariables
      };
    });

    await mongoSessionRun(async (session) => {
      const [evaluation] = await MongoEvaluation.create(
        [
          {
            teamId,
            tmbId,
            appId: data.appId,
            usageId,
            evalModel: data.evalModel,
            name: data.name
          }
        ],
        { session, ordered: true }
      );

      const evalItemsWithId = evalItems.map((item) => ({
        question: item.question,
        expectedResponse: item.expectedResponse,
        history: item.history,
        globalVariables: item.globalVariables,
        evalId: evaluation._id,
        status: EvaluationStatusEnum.queuing
      }));
      await MongoEvalItem.insertMany(evalItemsWithId, {
        session,
        ordered: false
      });

      await addEvaluationJob({ evalId: evaluation._id });
    });

    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_EVALUATION,
      params: {
        name: data.name,
        appName: app.name
      }
    });
  } catch (error) {
    addLog.error(`create evaluation error: ${error}`);
    removeFilesByPaths(filePaths);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
