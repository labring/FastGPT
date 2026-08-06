import type { RateLimitResult } from '@fastgpt/dal/redis/caches';

export const RateLimitSceneEnum = {
  Ip: 'ip',
  AccountVerification: 'account-verification',
  EnterpriseAuth: 'enterprise-auth',
  OutLink: 'out-link',
  Upload: 'upload',
  Member: 'member',
  Team: 'team'
} as const;

export type RateLimitScene = (typeof RateLimitSceneEnum)[keyof typeof RateLimitSceneEnum];
export type RateLimitFailureMode = 'open' | 'closed';
export type RateLimitKeySegment = string | number;

export type RateLimitInterfaceDefinition<TInput> = {
  scene: RateLimitScene;
  policy: string | ((input: TInput) => string);
  failureMode: RateLimitFailureMode;
  getKeySegments: (input: TInput) => readonly RateLimitKeySegment[];
  getLimit: (input: TInput) => number;
  getWindowSeconds: (input: TInput) => number;
  getIncrement?: (input: TInput) => number;
  createError: (input: TInput) => Error | string;
};

/** 所有场景接口统一提供原始消费、布尔判断和业务断言三种调用方式。 */
export type RateLimitInterface<TInput> = {
  consume: (input: TInput) => Promise<RateLimitResult>;
  check: (input: TInput) => Promise<boolean>;
  assert: (input: TInput) => Promise<void>;
};
