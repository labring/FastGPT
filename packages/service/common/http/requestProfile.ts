import type { IncomingHttpHeaders } from 'node:http';
import { withRequestProfile } from '../profiling';

export const REQUEST_PROFILE_HEADER = 'x-fastgpt-profile';

/**
 * HTTP 入口仅在显式携带 x-fastgpt-profile: 1 时创建采集上下文。
 * NextAPI 与原生 MCP 入口共用此适配器，不改变业务响应或协议。
 * 统计范围为 handler 执行期；响应 finish/close 的传输耗时由 HTTP 响应日志负责。
 */
export const withHttpRequestProfile = <T>(
  { headers, kind }: { headers: IncomingHttpHeaders; kind: string },
  run: () => Promise<T>
): Promise<T> => {
  if (headers[REQUEST_PROFILE_HEADER] !== '1') return run();

  return withRequestProfile({ kind }, run);
};
