import { ConcatBillProps, CreateBillProps } from '@fastgpt/global/support/wallet/bill/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { POST } from '@fastgpt/service/common/api/plusRequest';

export function createBill(data: CreateBillProps) {
  if (!global.systemEnv?.pluginBaseUrl) return;
  if (data.total === 0) {
    addLog.info('0 Bill', data);
  }
  try {
    POST('/support/wallet/bill/createBill', data);
  } catch (error) {}
}
export function concatBill(data: ConcatBillProps) {
  if (!global.systemEnv?.pluginBaseUrl) return;
  if (data.total === 0) {
    addLog.info('0 Bill', data);
  }
  try {
    POST('/support/wallet/bill/concatBill', data);
  } catch (error) {}
}
