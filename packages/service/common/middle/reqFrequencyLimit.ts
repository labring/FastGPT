import { jsonRes } from '../response';
import { serviceEnv } from '../../env';
import { getClientIpFromRequest } from '../security/clientIp';
import type { NodeApiResponse, NodeHttpRequest } from '../../types/http';
import { checkIPRateLimit } from '../rateLimit/interface/ip';

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
  return async (req: NodeHttpRequest, res: NodeApiResponse) => {
    if (!serviceEnv.USE_IP_LIMIT && !force) {
      return;
    }

    const ip = getClientIpFromRequest(req) ?? 'unknown';
    const allowed = await checkIPRateLimit({
      id,
      ip,
      limit,
      seconds
    });

    if (!allowed) {
      return jsonRes(res, {
        code: 429,
        error: `Too many request, request ${limit} times every ${seconds} seconds`
      });
    }
  };
}
