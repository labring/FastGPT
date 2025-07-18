import { parseHeaderCert } from '../controller';
import { authAppByTmbId } from '../app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { AppDetailType } from '@fastgpt/global/core/app/type';
import type { EvaluationSchemaType } from '@fastgpt/global/core/app/evaluation/type';
import type { AuthModeType } from '../type';
import { MongoEvaluation } from '../../../core/app/evaluation/evalSchema';

export const authEval = async ({
  evalId,
  ...props
}: AuthModeType & {
  evalId: string;
}): Promise<{
  evaluation: EvaluationSchemaType;
  app: AppDetailType;
  tmbId: string;
  teamId: string;
}> => {
  const { tmbId, isRoot } = await parseHeaderCert(props);
  const evaluation = await MongoEvaluation.findById(evalId);
  if (!evaluation) {
    throw new Error('Evaluation not found');
  }
  const { app } = await authAppByTmbId({
    tmbId,
    appId: evaluation.appId,
    per: ReadPermissionVal,
    isRoot
  });
  if (!app.permission.hasManagePer && String(evaluation.tmbId) !== String(tmbId)) {
    throw new Error('Permission denied');
  }
  return { evaluation, app, tmbId, teamId: String(evaluation.teamId) };
};
