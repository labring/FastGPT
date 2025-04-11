import { MongoOperationLog } from './schema';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { TemplateParamsMap } from './constants';
import { retryFn } from '../../../global/common/system/utils';

export function addOperationLog<T extends OperationLogEventEnum>({
  teamId,
  tmbId,
  event,
  params
}: {
  tmbId: string;
  teamId: string;
  event: T;
  params?: TemplateParamsMap[T];
}) {
  console.log('Insert log');
  retryFn(() =>
    MongoOperationLog.create({
      tmbId: tmbId,
      teamId: teamId,
      event,
      metadata: params
    })
  );
}
