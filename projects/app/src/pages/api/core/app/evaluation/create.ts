import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addLog } from '@fastgpt/service/common/system/log';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { readRawTextByLocalFile } from '@fastgpt/service/common/file/read/utils';
import { getEvaluationFileHeader } from '@fastgpt/global/core/app/evaluation/utils';
import { createEvaluationUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { MongoEvaluation } from '@fastgpt/service/core/app/evaluation/evalSchema';
import { MongoEvalItem } from '@fastgpt/service/core/app/evaluation/evalItemSchema';
import { addEvaluationJob } from '@fastgpt/service/core/app/evaluation';
import { getTeamStandPlan } from '@fastgpt/service/support/wallet/sub/utils';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import type { VariableItemType } from '@fastgpt/global/core/app/type.d';
import { evaluationFileErrors } from '@fastgpt/service/core/app/evaluation/constants';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

export type createEvaluationQuery = {};

export type createEvaluationBody = {
  name: string;
  appId: string;
  agentModel: string;
  file: File;
};

export type createEvaluationResponse = Record<string, never> | { error: string };

async function validateEvaluationFile(
  rawText: string,
  appVariables?: VariableItemType[],
  standardConstants?: { evalItemsCount?: number }
): Promise<{ lines: string[]; dataLength: number }> {
  const standardHeader = getEvaluationFileHeader(appVariables).trim();
  const fileHeader = rawText.trim().split('\r\n')[0];
  if (fileHeader !== standardHeader) {
    addLog.error(
      `Evaluation file header validation failed. Expected: ${standardHeader}, Got: ${fileHeader}`
    );
    return Promise.reject(evaluationFileErrors);
  }

  const lines = rawText.trim().split('\r\n');
  const dataLength = lines.length;
  if (dataLength <= 1) {
    addLog.error('Evaluation file has no data rows');
    return Promise.reject(evaluationFileErrors);
  }
  if (!standardConstants?.evalItemsCount || dataLength - 1 > standardConstants.evalItemsCount) {
    addLog.error(
      `Evaluation file has too many data rows. Max allowed: ${standardConstants?.evalItemsCount}, Got: ${dataLength - 1}`
    );
    return Promise.reject(evaluationFileErrors);
  }

  const headers = lines[0].split(',');

  const requiredFields: { index: number; name: string }[] = [];
  headers.forEach((header, index) => {
    const trimmedHeader = header.trim();
    if (trimmedHeader.startsWith('*')) {
      requiredFields.push({
        index,
        name: trimmedHeader
      });
    }
  });

  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    const values = line.split(',');

    requiredFields.forEach(({ index, name }) => {
      const value = values[index];
      if (!value || value.trim() === '') {
        errors.push(`Row ${i + 1} required field "${name}" is empty`);
      }
    });
  }

  if (errors.length > 0) {
    addLog.error(`Required field validation failed: ${errors.join('; ')}`);
    return Promise.reject(evaluationFileErrors);
  }

  const globalVariableErrors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',');

    appVariables?.forEach((variable, variableIndex) => {
      const value = values[variableIndex];
      if (!value && !variable.required) return;

      const trimmedValue = value?.trim();

      switch (variable.type) {
        case VariableInputEnum.input:
          // 字符串类型 - 校验字数限制
          if (variable.maxLength && trimmedValue && trimmedValue.length > variable.maxLength) {
            globalVariableErrors.push(
              `Row ${i + 1} variable "${variable.label}" exceeds max length (max: ${variable.maxLength}, current: ${trimmedValue.length})`
            );
          }
          break;

        case VariableInputEnum.numberInput:
          // 数字类型 - 校验是否为数字和范围
          if (trimmedValue) {
            const numValue = Number(trimmedValue);
            if (isNaN(numValue)) {
              globalVariableErrors.push(
                `Row ${i + 1} variable "${variable.label}" should be a number, current value: ${trimmedValue}`
              );
            } else {
              // 校验数字范围
              if (variable.min !== undefined && numValue < variable.min) {
                globalVariableErrors.push(
                  `Row ${i + 1} variable "${variable.label}" is below minimum value (min: ${variable.min}, current: ${numValue})`
                );
              }
              if (variable.max !== undefined && numValue > variable.max) {
                globalVariableErrors.push(
                  `Row ${i + 1} variable "${variable.label}" exceeds maximum value (max: ${variable.max}, current: ${numValue})`
                );
              }
            }
          }
          break;

        case VariableInputEnum.select:
          // 单选框 - 校验是否与选项完全一致
          if (trimmedValue && variable.enums && variable.enums.length > 0) {
            const validOptions = variable.enums.map((item) => item.value);
            if (!validOptions.includes(trimmedValue)) {
              globalVariableErrors.push(
                `Row ${i + 1} variable "${variable.label}" value not in valid options. Valid options: [${validOptions.join(', ')}], current value: ${trimmedValue}`
              );
            }
          }
          break;

        default:
          break;
      }
    });
  }

  if (globalVariableErrors.length > 0) {
    addLog.error(`Global variable validation failed: ${globalVariableErrors.join('; ')}`);
    return Promise.reject(evaluationFileErrors);
  }

  return { lines, dataLength };
}

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

    let lines: string[], dataLength: number;
    try {
      const result = await validateEvaluationFile(rawText, appVariables, standardConstants);
      lines = result.lines;
      dataLength = result.dataLength;
    } catch (error) {
      return Promise.reject(error);
    }

    const headers = lines[0].split(',');
    const qIndex = headers.findIndex((h) => h.trim() === '*q');
    const aIndex = headers.findIndex((h) => h.trim() === '*a');
    const historyIndex = headers.findIndex((h) => h.trim() === 'history');

    const { billId } = await createEvaluationUsage({
      teamId,
      tmbId,
      appName: app.name,
      agentModel: data.agentModel,
      evalItemCount: dataLength
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
      console.log('evalItems', evalItems);
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
