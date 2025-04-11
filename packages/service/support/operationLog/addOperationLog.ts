import { MongoOperationLog } from './schema';
import { operationLogTemplateCodeEnum } from '@fastgpt/global/support/operationLog/constants';
import { TemplateParamsMap } from './constants';

export async function addOperationLog<T extends operationLogTemplateCodeEnum>(
  tmbId: string,
  teamId: string,
  event: T,
  params: TemplateParamsMap[T]
) {
  await MongoOperationLog.create({
    tmbId: tmbId,
    teamId: teamId,
    event,
    metadata: params
  });
}
