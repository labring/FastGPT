import { parseHeaderCert } from '../controller';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { EvaluationSchemaType } from '@fastgpt/global/core/evaluation/type';
import type { AuthModeType } from '../type';
import { MongoEvaluation } from '../../../core/evaluation/task';

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

  const evaluation = await MongoEvaluation.findById(evalId).lean();
  if (!evaluation) {
    return Promise.reject('Evaluation not found');
  }

  // 检查评估是否属于当前团队
  if (String(evaluation.teamId) !== teamId) {
    return Promise.reject('Evaluation not found');
  }

  // 对于读权限，只要属于同一团队即可
  if (per === ReadPermissionVal) {
    return {
      teamId,
      tmbId,
      evaluation
    };
  }

  // 对于写权限，只有创建者或root用户可以操作
  if (String(evaluation.tmbId) === tmbId || isRoot) {
    return {
      teamId,
      tmbId,
      evaluation
    };
  }

  return Promise.reject('Permission denied');
};
