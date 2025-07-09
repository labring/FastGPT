import type { VariableItemType } from '@fastgpt/global/core/app/type';
import { addLog } from '../../../common/system/log';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { getEvaluationFileHeader } from '@fastgpt/global/core/app/evaluation/utils';
import { evaluationFileErrors } from '@fastgpt/global/core/app/evaluation/constants';
import { MongoResourcePermission } from '../../../support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { getGroupsByTmbId } from '../../../support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '../../../support/permission/org/controllers';
import { MongoApp } from '../schema';
import { concatPer } from '../../../support/permission/controller';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { AppDefaultPermissionVal } from '@fastgpt/global/support/permission/app/constant';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { type TeamPermission } from '@fastgpt/global/support/permission/user/controller';

export const validateEvaluationFile = async (
  rawText: string,
  appVariables?: VariableItemType[],
  standardConstants?: { evalItemsCount?: number }
) => {
  const lines = rawText.trim().split('\r\n');
  const dataLength = lines.length;

  // Validate file header
  const expectedHeader = getEvaluationFileHeader(appVariables);
  if (lines[0] !== expectedHeader) {
    addLog.error(`Header mismatch. Expected: ${expectedHeader}, Got: ${lines[0]}`);
    return Promise.reject(evaluationFileErrors);
  }

  // Validate data rows count
  if (dataLength <= 1) {
    addLog.error('No data rows found');
    return Promise.reject(evaluationFileErrors);
  }

  const maxRows = standardConstants?.evalItemsCount;
  if (maxRows && dataLength - 1 > maxRows) {
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

export const getAccessibleAppIds = async (
  teamId: string,
  tmbId: string,
  teamPer: TeamPermission
) => {
  if (teamPer.isOwner) {
    return null;
  }

  const [perList, myGroupMap, myOrgSet] = await Promise.all([
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.app,
      teamId,
      resourceId: { $exists: true }
    }).lean(),
    getGroupsByTmbId({ tmbId, teamId }).then((groups) => {
      const map = new Map<string, 1>();
      groups.forEach((group) => map.set(String(group._id), 1));
      return map;
    }),
    getOrgIdSetWithParentByTmbId({ teamId, tmbId })
  ]);

  const myPerList = perList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

  const idList = { _id: { $in: myPerList.map((item) => item.resourceId) } };
  const appPerQuery = { $or: [idList, { parentId: null }] };

  const myApps = await MongoApp.find(
    { ...appPerQuery, teamId },
    '_id parentId type tmbId inheritPermission'
  ).lean();

  const accessibleApps = myApps.filter((app) => {
    const getPer = (appId: string) => {
      const tmbPer = myPerList.find(
        (item) => String(item.resourceId) === appId && !!item.tmbId
      )?.permission;
      const groupPer = concatPer(
        myPerList
          .filter((item) => String(item.resourceId) === appId && (!!item.groupId || !!item.orgId))
          .map((item) => item.permission)
      );

      return new AppPermission({
        per: tmbPer ?? groupPer ?? AppDefaultPermissionVal,
        isOwner: String(app.tmbId) === String(tmbId)
      });
    };

    const Per =
      !AppFolderTypeList.includes(app.type) && app.parentId && app.inheritPermission
        ? getPer(String(app.parentId))
        : getPer(String(app._id));

    return Per.hasManagePer;
  });

  return accessibleApps.map((app) => app._id);
};
