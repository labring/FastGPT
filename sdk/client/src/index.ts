/*
 * @fastgpt/sdk 对外公共包入口。
 *
 * 说明：作为发布到 npm 的外部 SDK 顶层包边界（package.json "." 导出），
 * 此处集中向外部调用方暴露 FastGPT 客户端主类、异常类、流式会话类、高阶 Helper 与生成契约类型。
 */

import { ApiPromise } from './core/apiPromise';
import { BaseClient, SDK_VERSION } from './core/baseClient';
import {
  FastGptAuthError,
  FastGptBadRequestError,
  FastGptConflictError,
  FastGptError,
  FastGptNetworkError,
  FastGptNotFoundError,
  FastGptRateLimitError,
  FastGptServerError,
  FastGptTimeoutError
} from './core/errors';
import { ChatStream, type ChatSseEvent, type ChatStreamFinalResult } from './core/sse';
import type {
  AuthProxyIdentity,
  BinaryInput,
  CredentialProvider,
  ErrorHookContext,
  FastGptClientOptions,
  FastGptHooks,
  FastGptIdentity,
  FastGptLogLevel,
  FastGptLogger,
  RawRequestParams,
  RawResponseInfo,
  RequestHookContext,
  RequestOptions,
  ResponseHookContext,
  Uploadable,
  UploadableFileObject,
  WithRawResponseResult
} from './core/types';
import type {
  ChatFileContentPart,
  ChatImageContentPart,
  ChatUploadedContentPart,
  UploadChatFileParams,
  UploadChatFileResult
} from './helpers/chatUpload';
import type {
  CollectionTrainingProgress,
  DatasetTrainingProgress,
  UploadDatasetFileParams,
  UploadDatasetFileResult,
  WaitForCollectionTrainingParams,
  WaitForCollectionTrainingResult,
  WaitForDatasetTrainingParams,
  WaitForDatasetTrainingResult
} from './helpers/datasetUpload';
import { createSdkResources, type SdkResources } from './helpers/facades';
import {
  buildUserFormMessage,
  buildUserSelectMessage,
  extractInteractive,
  isInteractivePending,
  unwrapInteractive,
  type InteractivePayload,
  type InteractiveUserMessage,
  type ReplyUserFormParams,
  type ReplyUserSelectParams,
  type UserSelectInteractiveOption
} from './helpers/interactive';
import {
  createOffsetPaginator,
  createPageNumPaginator,
  type AsyncPageIterable,
  type AutoPagingOptions,
  type PageSlice
} from './helpers/pagination';
import type { PresignedUploadSession, UploadProgressInfo } from './helpers/s3Uploader';

/**
 * FastGPT 官方 SDK 客户端主入口。
 *
 * 支持个人 API Key 与应用 API Key，内置五大领域服务树（chat / datasets / apps.logs / models / system）、
 * 高阶场景助手（两阶段 S3 上传与训练等待、对话附件与交互恢复、自动分页）、
 * 请求级上下文覆盖与 `withIdentity({ customUid })` 派生隔离实例。
 */
export class FastGPT extends BaseClient {
  readonly apps: SdkResources['apps'];
  readonly chat: SdkResources['chat'];
  readonly datasets: SdkResources['datasets'];
  readonly models: SdkResources['models'];
  readonly system: SdkResources['system'];

  constructor(options: FastGptClientOptions = {}) {
    super(options);
    const resources = createSdkResources(this);
    this.apps = resources.apps;
    this.chat = resources.chat;
    this.datasets = resources.datasets;
    this.models = resources.models;
    this.system = resources.system;
  }

  /**
   * 派生绑定特定调用者身份（如 `{ customUid: 'user_42' }`）的轻量客户端实例，
   * 后续所有对话、历史、文件与日志调用将自动按契约位置（query / body / multipart）注入身份参数。
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

export {
  ApiPromise,
  buildUserFormMessage,
  buildUserSelectMessage,
  ChatStream,
  createOffsetPaginator,
  createPageNumPaginator,
  extractInteractive,
  FastGptAuthError,
  FastGptBadRequestError,
  FastGptConflictError,
  FastGptError,
  FastGptNetworkError,
  FastGptNotFoundError,
  FastGptRateLimitError,
  FastGptServerError,
  FastGptTimeoutError,
  isInteractivePending,
  SDK_VERSION,
  unwrapInteractive
};

export type {
  AsyncPageIterable,
  AuthProxyIdentity,
  AutoPagingOptions,
  BinaryInput,
  ChatFileContentPart,
  ChatImageContentPart,
  ChatSseEvent,
  ChatStreamFinalResult,
  ChatUploadedContentPart,
  CollectionTrainingProgress,
  CredentialProvider,
  DatasetTrainingProgress,
  ErrorHookContext,
  FastGptClientOptions,
  FastGptHooks,
  FastGptIdentity,
  FastGptLogLevel,
  FastGptLogger,
  InteractivePayload,
  InteractiveUserMessage,
  PageSlice,
  PresignedUploadSession,
  RawRequestParams,
  RawResponseInfo,
  ReplyUserFormParams,
  ReplyUserSelectParams,
  RequestHookContext,
  RequestOptions,
  ResponseHookContext,
  Uploadable,
  UploadableFileObject,
  UploadChatFileParams,
  UploadChatFileResult,
  UploadDatasetFileParams,
  UploadDatasetFileResult,
  UploadProgressInfo,
  UserSelectInteractiveOption,
  WaitForCollectionTrainingParams,
  WaitForCollectionTrainingResult,
  WaitForDatasetTrainingParams,
  WaitForDatasetTrainingResult,
  WithRawResponseResult
};

export type * from './generated/types';
