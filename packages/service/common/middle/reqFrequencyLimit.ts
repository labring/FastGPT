import { type ApiRequestProps } from '../../type/next';
import requestIp from 'request-ip';
import { authFrequencyLimit } from '../system/frequencyLimit/utils';
import { addSeconds } from 'date-fns';
import { type NextApiResponse } from 'next';
import { jsonRes } from '../response';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

// unit: times/s
// how to use?
// export default NextAPI(useQPSLimit(10), handler); // limit 10 times per second for a ip
export function useIPFrequencyLimit({
  id,
  seconds,
  limit,
  force = false,
  failClosed = false
}: {
  id: string;
  seconds: number;
  limit: number;
  force?: boolean;
  /** When true, Mongo errors reject with tooManyRequest instead of failing open. */
  failClosed?: boolean;
}) {
  return async (req: ApiRequestProps, res: NextApiResponse) => {
    const ip = requestIp.getClientIp(req);
    if (!ip || (process.env.USE_IP_LIMIT !== 'true' && !force)) {
      return;
    }
    try {
      await authFrequencyLimit({
        eventId: `ip-qps-limit-${id}-` + ip,
        maxAmount: limit,
        expiredTime: addSeconds(new Date(), seconds),
        strict: failClosed
      });
    } catch (err) {
      const isLimitExceeded = err && typeof err === 'object' && 'amount' in err;
      jsonRes(res, {
        code: 429,
        error:
          failClosed && !isLimitExceeded
            ? ERROR_ENUM.tooManyRequest
            : `Too many request, request ${limit} times every ${seconds} seconds`
      });
    }
  };
}
