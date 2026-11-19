/*
 * @fastgpt/sdk/server 反向服务端协议适配器子包公共入口。
 *
 * 说明：作为 package.json "./server" 独立导出边界，与客户端运行时完全解耦，
 * 不引入任何客户端代码或第三方 Web 框架依赖。
 */

import {
  ApiDatasetHttpError,
  createApiDatasetHandler,
  type ApiDatasetFileContent,
  type ApiDatasetFileItem,
  type ApiDatasetItemParams,
  type ApiDatasetListParams,
  type ApiDatasetProvider,
  type CreateApiDatasetHandlerOptions,
  type WebFetchHandler
} from './apiDataset';
import { toNodeHttpHandler } from './nodeAdapter';

export { ApiDatasetHttpError, createApiDatasetHandler, toNodeHttpHandler };

export type {
  ApiDatasetFileContent,
  ApiDatasetFileItem,
  ApiDatasetItemParams,
  ApiDatasetListParams,
  ApiDatasetProvider,
  CreateApiDatasetHandlerOptions,
  WebFetchHandler
};
