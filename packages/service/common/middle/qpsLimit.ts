import { ApiRequestProps } from 'type/next';
import requestIp from 'request-ip';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { authFrequencyLimit } from 'common/system/frequencyLimit/utils';
import { addSeconds } from 'date-fns';

// unit: times/s
// how to use?
// export default NextAPI(useQPSLimit(10), handler); // limit 10 times per second for a ip
export function useQPSLimit(limit: number) {
  return async (req: ApiRequestProps) => {
    const ip = requestIp.getClientIp(req);
    if (!ip) {
      return;
    }
    try {
      await authFrequencyLimit({
        eventId: 'ip-qps-limit' + ip,
        maxAmount: limit,
        expiredTime: addSeconds(new Date(), 1)
      });
    } catch (_) {
      return Promise.reject(ERROR_ENUM.QPSLimitExceed);
    }
  };
}
