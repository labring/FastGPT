import { MongoOperationLog } from './schema';
import { operationLogTemplateCodeEnum } from '@fastgpt/global/support/operationLog/constants';
import { TemplateParamsMap } from './constants';
import { Types } from 'mongoose';

export async function addOperationLog<T extends operationLogTemplateCodeEnum>(
  tmbId: string,
  teamId: string,
  event: T,
  params: TemplateParamsMap[T]
) {
  await MongoOperationLog.create({
    tmbId: new Types.ObjectId(tmbId),
    teamId: new Types.ObjectId(teamId),
    event,
    metadata: params
  });
}
