import { type ApiRequestProps } from '../../type/next';
import requestIp from 'request-ip';
import { authFrequencyLimit } from '../system/frequencyLimit/utils';
import { addSeconds } from 'date-fns';
import { type NextApiResponse } from 'next';
import { jsonRes } from '../response';
import { authCert } from '../../support/permission/auth/common';
import { teamFrequencyLimit } from '../api/frequencyLimit';

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
    const ip = requestIp.getClientIp(req);
    if (!ip || (process.env.USE_IP_LIMIT !== 'true' && !force)) {
      return;
    }
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

export function useTeamFrequencyLimit({
  paths = ['/api/v', '/api/core/', '/api/support/']
}: {
  paths?: string[];
} = {}) {
  return async (req: ApiRequestProps, res: NextApiResponse) => {
    const isTargetPath = paths.some((path) => req.url?.startsWith(path));
    if (!isTargetPath) {
      return;
    }

    try {
      const { teamId } = await authCert({
        req,
        authToken: true,
        authApiKey: true
      });

      if (teamId) {
        await teamFrequencyLimit({
          teamId,
          type: req.url as any,
          res
        });
      }
    } catch (error) {
      return;
    }
  };
}
