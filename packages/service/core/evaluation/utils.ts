import { evaluationFileErrors } from '@fastgpt/global/core/evaluation/constants';
import { getEvaluationFileHeader } from '@fastgpt/global/core/evaluation/utils';
import type { VariableItemType } from '@fastgpt/global/core/app/type';
// import { addLog } from '@fastgpt/service/common/system/log';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { Types } from 'mongoose';
import { retryFn } from '@fastgpt/global/common/system/utils';
import { i18nT } from '../../../web/i18n/utils';
import { addLog } from '../../common/system/log';
import { MongoEvaluation } from './evalSchema';
import { addEvaluationJob } from './mq';

export const validateEvaluationFile = async (
  rawText: string,
  appVariables?: VariableItemType[]
) => {
  // const lines = rawText.trim().split('\r\n');
  // const dataLength = lines.length;

  // 使用正则表达式分割所有类型的换行符（\r\n、\n、\r）
  const lines = rawText.trim().split(/\r?\n|\r/);
  const dataLength = lines.length;

  // 过滤可能的空行（处理文件末尾可能的空行）
  const nonEmptyLines = lines.filter((line) => line.trim() !== '');
  if (nonEmptyLines.length === 0) {
    addLog.error('File is empty');
    return Promise.reject(evaluationFileErrors);
  }

  // Validate file header
  const expectedHeader = getEvaluationFileHeader(appVariables);
  // 去除头部可能的空白字符（如BOM头或空格）
  const actualHeader = nonEmptyLines[0].trim();

  if (actualHeader !== expectedHeader) {
    addLog.error(`Header mismatch. Expected: "${expectedHeader}", Got: "${actualHeader}"`);
    return Promise.reject(evaluationFileErrors);
  }

  // Validate data rows count
  if (dataLength <= 1) {
    addLog.error('No data rows found');
    return Promise.reject(evaluationFileErrors);
  }

  const maxRows = 1000;
  if (dataLength - 1 > maxRows) {
    addLog.error(`Too many rows. Max: ${maxRows}, Got: ${dataLength - 1}`);
    return Promise.reject(evaluationFileErrors);
  }

  const headers = lines[0].split(',');

  // Get required field indices
  const requiredFields = headers
    .map((header, index) => ({ header: header.trim(), index }))
    .filter(({ header }) => header.startsWith('*'));

  const errors: string[] = [];

  // Validate each data row
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].trim().split(',');

    // Check required fields
    requiredFields.forEach(({ header, index }) => {
      if (!values[index]?.trim()) {
        errors.push(`Row ${i + 1}: required field "${header}" is empty`);
      }
    });

    // Validate app variables
    if (appVariables) {
      validateRowVariables({
        values,
        variables: appVariables,
        rowNum: i + 1,
        errors
      });
    }
  }

  if (errors.length > 0) {
    addLog.error(`Validation failed: ${errors.join('; ')}`);
    return Promise.reject(evaluationFileErrors);
  }

  return { lines, dataLength };
};

const validateRowVariables = ({
  values,
  variables,
  rowNum,
  errors
}: {
  values: string[];
  variables: VariableItemType[];
  rowNum: number;
  errors: string[];
}) => {
  variables.forEach((variable, index) => {
    const value = values[index]?.trim();

    // Skip validation if value is empty and not required
    if (!value && !variable.required) return;

    switch (variable.type) {
      case VariableInputEnum.input:
        // Validate string length
        if (variable.maxLength && value && value.length > variable.maxLength) {
          errors.push(
            `Row ${rowNum}: "${variable.label}" exceeds max length (${variable.maxLength})`
          );
        }
        break;

      case VariableInputEnum.numberInput:
        // Validate number type and range
        if (value) {
          const numValue = Number(value);
          if (isNaN(numValue)) {
            errors.push(`Row ${rowNum}: "${variable.label}" must be a number`);
          } else {
            if (variable.min !== undefined && numValue < variable.min) {
              errors.push(`Row ${rowNum}: "${variable.label}" below minimum (${variable.min})`);
            }
            if (variable.max !== undefined && numValue > variable.max) {
              errors.push(`Row ${rowNum}: "${variable.label}" exceeds maximum (${variable.max})`);
            }
          }
        }
        break;

      case VariableInputEnum.select:
        // Validate select options
        if (value && variable.enums?.length) {
          const validOptions = variable.enums.map((item) => item.value);
          if (!validOptions.includes(value)) {
            errors.push(
              `Row ${rowNum}: "${variable.label}" invalid option. Valid: [${validOptions.join(', ')}]`
            );
          }
        }
        break;
    }
  });
};

export const checkTeamHasRunningEvaluation = async (teamId: string) => {
  const runningEvaluation = await MongoEvaluation.findOne(
    {
      teamId: new Types.ObjectId(teamId),
      finishTime: { $exists: false }
    },
    '_id'
  ).lean();

  if (runningEvaluation) {
    return Promise.reject(i18nT('dashboard_evaluation:team_has_running_evaluation'));
  }
};

export const resumePausedEvaluations = async (teamId: string): Promise<any> => {
  return retryFn(async () => {
    const pausedEvaluations = await MongoEvaluation.find({
      teamId: new Types.ObjectId(teamId),
      errorMessage: TeamErrEnum.aiPointsNotEnough,
      finishTime: { $exists: false }
    }).lean();

    if (pausedEvaluations.length === 0) {
      return;
    }

    for (const evaluation of pausedEvaluations) {
      await MongoEvaluation.updateOne({ _id: evaluation._id }, { $unset: { errorMessage: 1 } });
      await addEvaluationJob({ evalId: String(evaluation._id) });
    }

    addLog.info('Resumed paused evaluations', { teamId, count: pausedEvaluations.length });
  }, 3);
};
