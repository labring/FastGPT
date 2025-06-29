import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addLog } from '@fastgpt/service/common/system/log';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { readRawTextByLocalFile } from '@fastgpt/service/common/file/read/utils';
import { createEvaluationUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import { MongoEvalItem } from '@fastgpt/service/core/app/evaluation/evalItemSchema';
import { addEvaluationJob } from '@fastgpt/service/core/app/evaluation';
import { getTeamStandPlan } from '@fastgpt/service/support/wallet/sub/utils';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { validateEvaluationFile } from '@fastgpt/service/core/app/evaluation/utils';

export type createEvaluationQuery = {};

export type createEvaluationBody = {
  name: string;
  appId: string;
  agentModel: string;
  file: File;
};

export type createEvaluationResponse = Record<string, never> | { error: string };

async function handler(
  req: ApiRequestProps<createEvaluationBody, createEvaluationQuery>,
  res: ApiResponseType<any>
): Promise<createEvaluationResponse> {
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
      per: ManagePermissionVal,
      appId: data.appId
    });

    const { rawText } = await readRawTextByLocalFile({
      teamId,
      tmbId,
      path: file.path,
      encoding: file.encoding,
      getFormatText: false
    });
    const { standardConstants } = await getTeamStandPlan({ teamId });

    const appVariables = app.chatConfig.variables;

    const { lines, dataLength } = await (async () => {
      try {
        return await validateEvaluationFile(rawText, appVariables, standardConstants);
      } catch (error) {
        return Promise.reject(error);
      }
    })();

    const headers = lines[0].split(',');
    const qIndex = headers.findIndex((h) => h.trim() === '*q');
    const aIndex = headers.findIndex((h) => h.trim() === '*a');
    const historyIndex = headers.findIndex((h) => h.trim() === 'history');

    const { billId } = await createEvaluationUsage({
      teamId,
      tmbId,
      appName: app.name
    });

    const [{ _id: evalId }] = await MongoEvaluation.create([
      {
        teamId,
        tmbId,
        appId: data.appId,
        agentModel: data.agentModel,
        name: data.name,
        createTime: new Date()
      }
    ]);

    const evalItems = [];
    for (let i = 1; i < dataLength; i++) {
      const line = lines[i].trim();
      const values = line.split(',');

      const question = values[qIndex];
      const expectedResponse = values[aIndex];
      const history = historyIndex !== -1 ? values[historyIndex] : '';

      const globalVariales: Record<string, string> = {};
      for (let j = 0; j < qIndex; j++) {
        const headerName = headers[j].trim().replace(/^\*/, '');
        globalVariales[headerName] = values[j];
      }

      evalItems.push({
        evalId,
        question,
        expectedResponse,
        history,
        globalVariales,
        status: 0,
        retryTimes: 5
      });
    }

    if (evalItems.length > 0) {
      await MongoEvalItem.create(evalItems);
    }

    await addEvaluationJob({ evalId: evalId.toString(), billId });

    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.CREATE_EVALUATION,
      params: {
        appName: app.name,
        appType: getI18nAppType(app.type)
      }
    });

    return {};
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
