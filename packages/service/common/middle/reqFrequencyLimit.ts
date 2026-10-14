import { jsonRes } from '../response';
import { getSystemInstanceConfig } from '../system/systemInstanceConfig/controller';
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
    // 实例配置为权威来源（blockStartup 迁移已回填 env 初值）；?? 兜底仅覆盖
    // 叶子缺省的部分快照（测试种子）场景——生产快照（含未初始化时的默认合成）
    // 叶子恒被 schema 默认值填满，env 不是并行的第二生效来源。
    const useIpLimit = getSystemInstanceConfig().security.useIpLimit ?? serviceEnv.USE_IP_LIMIT;
    if (!useIpLimit && !force) {
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
