import type { IncomingMessage, ServerResponse } from 'node:http';

/** Node.js HTTP 请求对象，供 service 层声明与具体 Web 框架无关的请求边界。 */
export type NodeHttpRequest = IncomingMessage;

/** Node.js HTTP 响应对象，兼容 Next.js API Response 等基于 ServerResponse 的实现。 */
export type NodeHttpResponse = ServerResponse<IncomingMessage>;

/** 已完成 body 和 query 解析的 Node.js API 请求。 */
export type NodeApiRequest<Body = any, Query = any> = NodeHttpRequest & {
  body: Body;
  query: Query;
};

/** 支持链式状态码和 JSON 输出的 Node.js API 响应。 */
export type NodeApiResponse<Data = any> = NodeHttpResponse & {
  status(statusCode: number): NodeApiResponse<Data>;
  json(data: Data): void;
};
