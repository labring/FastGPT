/*
 * @fastgpt/sdk 主客户端入口（package.json "." 导出）。
 *
 * 严格遵循仓库「禁止 re-export」规范：本模块仅定义并导出 FastGPT 客户端主类，
 * 异常类、SSE 流、交互/分页助手与生成契约类型分别由各自的定义模块通过
 * package.json 子路径映射（@fastgpt/sdk/errors、/sse、/interactive、/pagination、/types、/options）直接导出。
 */

import { BaseClient } from './core/baseClient';
import type { FastGptClientOptions, FastGptIdentity } from './core/types';
import { createSdkResources, type SdkResources } from './helpers/facades';

/**
 * FastGPT 官方 SDK 客户端主入口。
 *
 * 严格基于 System OpenAPI 声明提供四大开放领域服务树（chat / datasets / apps.logs / models）、
 * 交互恢复与自动分页助手、请求级上下文覆盖与 `withIdentity({ customUid })` 派生隔离实例。
 */
export class FastGPT extends BaseClient {
  readonly apps: SdkResources['apps'];
  readonly chat: SdkResources['chat'];
  readonly datasets: SdkResources['datasets'];
  readonly models: SdkResources['models'];

  constructor(options: FastGptClientOptions = {}) {
    super(options);
    const resources = createSdkResources(this);
    this.apps = resources.apps;
    this.chat = resources.chat;
    this.datasets = resources.datasets;
    this.models = resources.models;
  }

  /**
   * 派生绑定特定调用者身份（如 `{ customUid: 'user_42' }`）的轻量客户端实例，
   * 后续所有对话、历史、记录与日志调用将自动按契约位置（query / body / multipart）注入身份参数。
   */
  withIdentity(identity: FastGptIdentity): FastGPT {
    return new FastGPT({
      ...this._options,
      identity
    });
  }

  /**
   * 派生覆盖部分配置（如切换 `apiKey`、`defaultAppId` 或 `timeoutMs`）的新客户端实例。
   */
  withOptions(overrides: Partial<FastGptClientOptions>): FastGPT {
    return new FastGPT({
      ...this._options,
      ...overrides
    });
  }
}
