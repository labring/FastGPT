import { jsonRes } from '../response';
import { getClientIpFromRequest } from '../security/clientIp';
import type { NodeApiResponse, NodeHttpRequest } from '../../types/http';
import { checkIPRateLimit } from '../rateLimit/interface/ip';

/**
 * 为接入接口按客户端 IP 限流；注册后始终执行，不提供关闭开关。
 * id 区分接口策略，seconds/limit 定义时间窗口和额度，客户端 IP 使用统一的可信代理解析。
 * 超限返回 429；Redis 故障策略由底层 IP 限流接口统一处理。
 */
export function useIPFrequencyLimit({
  id,
  seconds,
  limit
}: {
  id: string;
  seconds: number;
  limit: number;
}) {
  return async (req: NodeHttpRequest, res: NodeApiResponse) => {
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
