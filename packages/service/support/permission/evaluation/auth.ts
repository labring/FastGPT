import { authAppByTmbId } from '../app/auth';
import type { AppWithPermissionType } from '@fastgpt/global/core/app/type';
import {
  ManagePermissionVal,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import type { EvaluationSchemaType } from '@fastgpt/global/core/app/evaluation/type';
import type { AuthModeType } from '../type';
import { MongoEvaluation } from '../../../core/app/evaluation/evalSchema';
import { parseHeaderCert } from '../auth/common';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';

export const authEval = async ({
  evalId,
  per = ReadPermissionVal,
  ...props
}: AuthModeType & {
  evalId: string;
}): Promise<{
  evaluation: EvaluationSchemaType;
  app?: AppWithPermissionType;
  tmbId: string;
  teamId: string;
}> => {
  const { teamId, tmbId, isRoot } = await parseHeaderCert(props);

  const evaluation = await MongoEvaluation.findOne(
    {
      _id: evalId,
      teamId
    },
    'tmbId appId name'
  ).lean();
  if (!evaluation) {
    return Promise.reject('Evaluation not found');
  }

  if (String(evaluation.tmbId) === tmbId) {
    return {
      teamId,
      tmbId,
      evaluation
    };
  }

  let app: AppWithPermissionType | undefined;
  try {
    // App read per
    if (per === ReadPermissionVal) {
      ({ app } = await authAppByTmbId({
        tmbId,
        appId: evaluation.appId,
        per: ReadPermissionVal,
        isRoot
      }));

      return {
        teamId,
        tmbId,
        evaluation,
        app
      };
    }

    // Write per
    ({ app } = await authAppByTmbId({
      tmbId,
      appId: evaluation.appId,
      per: ManagePermissionVal,
      isRoot
    }));
  } catch (error) {
    // If app does not exist, allow operation (app was deleted, allow eval cleanup)
    if (error !== AppErrEnum.unExist) {
      throw error;
    }
  }

  return {
    teamId,
    tmbId,
    evaluation,
    app
  };
};
