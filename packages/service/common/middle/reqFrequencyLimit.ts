import { type ApiRequestProps } from '../../type/next';
import { authFrequencyLimit } from '../system/frequencyLimit/utils';
import { addSeconds } from 'date-fns';
import { type NextApiResponse } from 'next';
import { jsonRes } from '../response';
import { serviceEnv } from '../../env';
import { getClientIpFromRequest } from '../security/clientIp';

// unit: times/s
// how to use?
// export default NextAPI(useQPSLimit(10), handler); // limit 10 times per second for a ip
export function useIPFrequencyLimit({
  id,
  seconds,
  limit,
  force = false
}: {
  id: string;
  seconds: number;
  limit: number;
  force?: boolean;
}) {
  return async (req: ApiRequestProps, res: NextApiResponse) => {
    if (!serviceEnv.USE_IP_LIMIT && !force) {
      return;
    }

    const ip = getClientIpFromRequest(req) ?? 'unknown';
    try {
      await authFrequencyLimit({
        eventId: `ip-qps-limit-${id}-` + ip,
        maxAmount: limit,
        expiredTime: addSeconds(new Date(), seconds)
      });
    } catch (_) {
      jsonRes(res, {
        code: 429,
        error: `Too many request, request ${limit} times every ${seconds} seconds`
      });
    }
  };
}
