import { http } from './axios';
import type { AxiosRequestConfig } from 'axios';

interface RequestConfig<T = any> extends Omit<AxiosRequestConfig, 'url' | 'method' | 'data'> {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: T;
  params?: Record<string, any>;
}

/**
 * 通用 JSON API 请求封装
 * @example
 * const result = await request<SqlQueryResponse>({
 *   url: '/api/v1/data_source/sql_query',
 *   method: 'POST',
 *   data: { sql: 'SELECT * FROM users' }
 * });
 */
export async function request<TResponse = any, TRequest = any>(
  config: RequestConfig<TRequest>
): Promise<TResponse> {
  return http(config);
}
