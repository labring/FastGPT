/**
 * 网络请求安全配置
 *
 * 所有网络请求通过 SystemHelper.httpRequest() 收口，
 * 禁止沙盒内直接使用网络模块。
 */
import { config } from '../config';

/** 内网 IP 段黑名单（CIDR） */
export const BLOCKED_IP_RANGES = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16', // link-local / cloud metadata
  '127.0.0.0/8',
  '0.0.0.0/8',
  '::1/128',
  'fc00::/7', // IPv6 ULA
  'fe80::/10' // IPv6 link-local
];

/** 请求限制（从环境变量读取） */
export const REQUEST_LIMITS = {
  /** 单次执行最大请求数 */
  maxRequests: config.maxRequests,
  /** 单次请求超时 (ms) */
  timeoutMs: config.requestTimeoutMs,
  /** 最大响应体大小 (bytes) */
  maxResponseSize: config.maxResponseSize,
  /** 允许的协议 */
  allowedProtocols: ['http:', 'https:']
};
