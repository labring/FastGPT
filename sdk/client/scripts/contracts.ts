import type { z } from 'zod';
import * as D from '@fastgpt/global/openapi/core/dataset/api';
import * as C from '@fastgpt/global/openapi/core/dataset/collection/api';
import * as Create from '@fastgpt/global/openapi/core/dataset/collection/createApi';
import * as Download from '@fastgpt/global/openapi/core/dataset/collection/batchDownloadApi';
import * as Data from '@fastgpt/global/openapi/core/dataset/data/api';
import * as B from '@fastgpt/global/openapi/common/batch/api';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// 联合搜索契约由独立 PR #8194 提供。普通构建使用已提交产物；生成时可指向该 PR 的源码。
const searchSource = process.env.FASTGPT_API_CONTRACTS_ROOT
  ? pathToFileURL(
      resolve(
        process.env.FASTGPT_API_CONTRACTS_ROOT,
        'packages/global/openapi/core/dataset/search/api.ts'
      )
    ).href
  : '@fastgpt/global/openapi/core/dataset/search/api';
const Search: { SearchDatasetBodySchema: z.ZodType; SearchDatasetResponseSchema: z.ZodType } =
  await import(searchSource);

/** 仅封装正式 Open API 文档中的非弃用知识库操作，生成 SDK 类型和 CLI 参数定义。 */
export const contracts = {
  list: {
    method: 'POST',
    path: 'core/dataset/listV2',
    description: 'List datasets',
    input: D.GetDatasetListV2BodySchema,
    output: D.GetDatasetListV2ResponseSchema
  },
  get: {
    method: 'GET',
    path: 'core/dataset/detail',
    description: 'Get a dataset',
    input: D.GetDatasetDetailQuerySchema,
    output: D.GetDatasetDetailResponseSchema
  },
  create: {
    method: 'POST',
    path: 'core/dataset/create',
    description: 'Create a dataset',
    // 客户端补齐便捷默认值，不要求现有服务端修改创建协议。
    input: D.CreateDatasetBodySchema.extend({
      type: D.CreateDatasetBodySchema.shape.type.default(DatasetTypeEnum.dataset),
      intro: D.CreateDatasetBodySchema.shape.intro.default('')
    }),
    output: D.CreateDatasetResponseSchema
  },
  delete: {
    method: 'DELETE',
    path: 'core/dataset/delete',
    description: 'Delete a dataset',
    input: D.DeleteDatasetQuerySchema,
    output: 'void'
  },
  batchMove: {
    method: 'POST',
    path: 'core/dataset/batch/move',
    description: 'Move datasets',
    input: B.BatchResourceMoveBodySchema,
    output: B.BatchResourceActionResponseSchema
  },
  batchDelete: {
    method: 'POST',
    path: 'core/dataset/batch/delete',
    description: 'Delete datasets',
    input: B.BatchResourceDeleteBodySchema,
    output: B.BatchResourceActionResponseSchema
  },
  search: {
    method: 'POST',
    path: 'core/dataset/search',
    description: 'Search across datasets',
    input: Search.SearchDatasetBodySchema,
    output: Search.SearchDatasetResponseSchema
  },
  searchTest: {
    method: 'POST',
    path: 'core/dataset/searchTest',
    description: 'Test single-dataset search',
    input: D.SearchDatasetTestBodySchema,
    output: D.SearchDatasetTestResponseSchema
  },
  'collections.list': {
    method: 'POST',
    path: 'core/dataset/collection/listV2',
    description: 'List collections',
    input: C.ListCollectionV2BodySchema,
    output: C.ListCollectionV2ResponseSchema
  },
  'collections.get': {
    method: 'GET',
    path: 'core/dataset/collection/detail',
    description: 'Get a collection',
    input: C.GetCollectionDetailQuerySchema,
    output: C.GetCollectionDetailResponseSchema
  },
  'collections.create': {
    method: 'POST',
    path: 'core/dataset/collection/create',
    description: 'Create an empty collection or folder',
    input: Create.CreateCollectionBodySchema,
    output: Create.CreateCollectionResponseSchema
  },
  'collections.update': {
    method: 'POST',
    path: 'core/dataset/collection/update',
    description: 'Update a collection',
    input: C.UpdateDatasetCollectionBodySchema,
    output: 'void'
  },
  'collections.delete': {
    method: 'POST',
    path: 'core/dataset/collection/delete',
    description: 'Delete collections',
    input: C.DeleteCollectionBodySchema,
    output: 'void'
  },
  'collections.importText': {
    method: 'POST',
    path: 'core/dataset/collection/create/text',
    description: 'Import text',
    input: Create.CreateTextCollectionBodySchema,
    output: Create.CreateCollectionWithResultResponseSchema
  },
  'collections.importUrl': {
    method: 'POST',
    path: 'core/dataset/collection/create/link',
    description: 'Import a URL',
    input: Create.CreateLinkCollectionBodySchema,
    output: Create.CreateCollectionWithResultResponseSchema
  },
  'collections.importFile': {
    method: 'POST',
    path: 'core/dataset/collection/create/localFile',
    description: 'Upload a file',
    input: Create.CreateCollectionByLocalFileBodySchema,
    output: Create.CreateCollectionWithResultResponseSchema,
    upload: 'file'
  },
  'collections.downloadTicket': {
    method: 'POST',
    path: 'core/dataset/collection/getDownloadTicket',
    description: 'Prepare collection download',
    input: Download.GetDownloadTicketDatasetCollectionsBodySchema,
    output: Download.GetDownloadTicketDatasetCollectionsResponseSchema
  },
  'collections.download': {
    method: 'GET',
    path: 'core/dataset/collection/batchDownload',
    description: 'Download collection archive',
    input: Download.BatchDownloadDatasetCollectionsQuerySchema,
    output: 'download'
  },
  'chunks.list': {
    method: 'POST',
    path: 'core/dataset/data/v2/list',
    description: 'List chunks',
    input: Data.GetDatasetDataListBodySchema,
    output: Data.GetDatasetDataListResponseSchema
  },
  'chunks.get': {
    method: 'GET',
    path: 'core/dataset/data/detail',
    description: 'Get a chunk',
    input: Data.GetDatasetDataDetailQuerySchema,
    output: Data.GetDatasetDataDetailResponseSchema
  },
  'chunks.update': {
    method: 'PUT',
    path: 'core/dataset/data/update',
    description: 'Update a chunk',
    input: Data.UpdateDatasetDataBodySchema,
    output: Data.UpdateDatasetDataResponseSchema
  },
  'chunks.delete': {
    method: 'DELETE',
    path: 'core/dataset/data/delete',
    description: 'Delete a chunk',
    input: Data.DeleteDatasetDataQuerySchema,
    output: 'void'
  },
  'chunks.push': {
    method: 'POST',
    path: 'core/dataset/data/pushData',
    description: 'Enqueue chunks for training',
    input: Data.PushDataBodySchema,
    output: Data.PushDataResponseSchema
  }
} as const satisfies Record<
  string,
  {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    path: string;
    description: string;
    input: z.ZodType;
    output: z.ZodType | 'void' | 'download' | 'string' | 'number';
    upload?: 'file' | 'files';
  }
>;
