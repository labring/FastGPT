import { authAppByTmbId } from '../app/auth';
import {
  ManagePermissionVal,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import type { EvaluationSchemaType } from '@fastgpt/global/core/app/evaluation/type';
import type { AuthModeType } from '../type';
import { MongoEvaluation } from '../../../core/app/evaluation/evalSchema';
import { parseHeaderCert } from '../auth/common';

export const authEval = async ({
  evalId,
  per = ReadPermissionVal,
  ...props
}: AuthModeType & {
  evalId: string;
}): Promise<{
  evaluation: EvaluationSchemaType;
  tmbId: string;
  teamId: string;
}> => {
  const { teamId, tmbId, isRoot } = await parseHeaderCert(props);

  const evaluation = await MongoEvaluation.findById(evalId, 'tmbId').lean();
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

  // App read per
  if (per === ReadPermissionVal) {
    await authAppByTmbId({
      tmbId,
      appId: evaluation.appId,
      per: ReadPermissionVal,
      isRoot
    });
    return {
      teamId,
      tmbId,
      evaluation
    };
  }

  // Write per
  await authAppByTmbId({
    tmbId,
    appId: evaluation.appId,
    per: ManagePermissionVal,
    isRoot
  });
  return {
    teamId,
    tmbId,
    evaluation
  };
};
