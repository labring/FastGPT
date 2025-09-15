import { c } from '../init';
import { PaginationRequestSchema, PaginationResponseSchema } from '../schemas/common';
import {
  AppListParamsSchema,
  AppDetailRequestSchema,
  CreateAppRequestSchema,
  CreateAppFolderRequestSchema,
  UpdateAppRequestSchema,
  DeleteAppRequestSchema,
  PublishVersionRequestSchema,
  VersionListRequestSchema,
  ChatLogsRequestSchema,
  AppListResponseSchema,
  AppDetailResponseSchema,
  CreateAppResponseSchema,
  DeleteAppResponseSchema,
  UpdateAppResponseSchema,
  PublishVersionResponseSchema,
  ExportChatLogsResponseSchema,
  AppVersionListItemSchema,
  AppLogItemSchema
} from '../schemas/app';

export const appContract = c.router({
  // 获取应用列表
  list: {
    method: 'POST',
    path: '/core/app/test2',
    body: AppListParamsSchema,
    responses: {
      200: AppListResponseSchema
    },
    summary: '获取应用列表'
  }

  // 获取应用详情
  // detail: {
  //   method: 'GET',
  //   path: '/core/app/detail',
  //   query: AppDetailRequestSchema,
  //   responses: {
  //     200: AppDetailResponseSchema
  //   },
  //   summary: '获取应用详情'
  // },

  // // 创建应用
  // create: {
  //   method: 'POST',
  //   path: '/core/app/create',
  //   body: CreateAppRequestSchema,
  //   responses: {
  //     200: CreateAppResponseSchema
  //   },
  //   summary: '创建应用'
  // },

  // // 创建应用文件夹
  // createFolder: {
  //   method: 'POST',
  //   path: '/core/app/folder/create',
  //   body: CreateAppFolderRequestSchema,
  //   responses: {
  //     200: UpdateAppResponseSchema
  //   },
  //   summary: '创建应用文件夹'
  // },

  // // 删除应用
  // delete: {
  //   method: 'DELETE',
  //   path: '/core/app/del',
  //   query: DeleteAppRequestSchema,
  //   responses: {
  //     200: DeleteAppResponseSchema
  //   },
  //   summary: '删除应用'
  // },

  // // 更新应用
  // update: {
  //   method: 'PUT',
  //   path: '/core/app/update',
  //   body: UpdateAppRequestSchema,
  //   responses: {
  //     200: UpdateAppResponseSchema
  //   },
  //   summary: '更新应用'
  // },

  // // 发布应用版本
  // publishVersion: {
  //   method: 'POST',
  //   path: '/core/app/version/publish',
  //   query: AppDetailRequestSchema, // 需要 appId
  //   body: PublishVersionRequestSchema,
  //   responses: {
  //     200: PublishVersionResponseSchema
  //   },
  //   summary: '发布应用版本'
  // },

  // // 获取应用版本列表
  // versionList: {
  //   method: 'POST',
  //   path: '/core/app/version/list',
  //   body: VersionListRequestSchema.merge(PaginationRequestSchema),
  //   responses: {
  //     200: PaginationResponseSchema(AppVersionListItemSchema)
  //   },
  //   summary: '获取应用版本列表'
  // },

  // // 获取应用聊天日志
  // getChatLogs: {
  //   method: 'POST',
  //   path: '/core/app/getChatLogs',
  //   body: ChatLogsRequestSchema.merge(PaginationRequestSchema.omit({ pageSize: true })).extend({
  //     pageSize: PaginationRequestSchema.shape.pageSize.default(20)
  //   }),
  //   responses: {
  //     200: PaginationResponseSchema(AppLogItemSchema)
  //   },
  //   summary: '获取应用聊天日志'
  // },

  // // 导出应用聊天日志
  // exportChatLogs: {
  //   method: 'POST',
  //   path: '/core/app/exportChatLogs',
  //   body: ChatLogsRequestSchema,
  //   responses: {
  //     200: ExportChatLogsResponseSchema
  //   },
  //   summary: '导出应用聊天日志'
  // }
});
