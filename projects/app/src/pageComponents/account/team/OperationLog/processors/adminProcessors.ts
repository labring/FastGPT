import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { getI18nInformLevel } from '@fastgpt/service/support/operationLog/util';
import type { MetadataProcessor } from './index';

const adminSendSystemInformProcessor: MetadataProcessor = (metadata: any, t: any) => {
  const result = { ...metadata };

  if (result.level) {
    result.level = getI18nInformLevel(result.level);
  }

  return result;
};

export const createAdminProcessors: Partial<Record<OperationLogEventEnum, MetadataProcessor>> = {
  [OperationLogEventEnum.ADMIN_SEND_SYSTEM_INFORM]: adminSendSystemInformProcessor
};
