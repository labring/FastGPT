import { ConcatUsageProps, CreateUsageProps } from '@fastgpt/global/support/wallet/usage/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { POST } from '@fastgpt/service/common/api/plusRequest';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';

export async function createUsage(data: CreateUsageProps) {
  if (!FastGPTProUrl) return;
  if (data.totalPoints === 0) {
    addLog.info('0 totalPoints', data);
  }
  try {
    await POST('/support/wallet/usage/createUsage', data);
  } catch (error) {
    addLog.error('createUsage error', error);
  }
}
export async function concatUsage(data: ConcatUsageProps) {
  if (!FastGPTProUrl) return;
  if (data.totalPoints === 0) {
    addLog.info('0 totalPoints', data);
  }
  try {
    await POST('/support/wallet/usage/concatUsage', data);
  } catch (error) {
    addLog.error('concatUsage error', error);
  }
}
