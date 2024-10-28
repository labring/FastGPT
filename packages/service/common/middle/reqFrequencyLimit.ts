import { ApiRequestProps } from '../../type/next';
import requestIp from 'request-ip';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { authFrequencyLimit } from '../system/frequencyLimit/utils';
import { addSeconds } from 'date-fns';
import { NextApiResponse } from 'next';
import { jsonRes } from '../response';

// unit: times/s
// how to use?
// export default NextAPI(useQPSLimit(10), handler); // limit 10 times per second for a ip
export function useReqFrequencyLimit(seconds: number, limit: number) {
  return async (req: ApiRequestProps, res: NextApiResponse) => {
    const ip = requestIp.getClientIp(req);
    if (!ip || process.env.USE_IP_LIMIT !== 'true') {
      return;
    }
    try {
      await authFrequencyLimit({
        eventId: 'ip-qps-limit' + ip,
        maxAmount: limit,
        expiredTime: addSeconds(new Date(), seconds)
      });
    } catch (_) {
      res.status(429);
      jsonRes(res, {
        code: 429,
        message: ERROR_ENUM.tooManyRequest
      });
    }
  };
}
