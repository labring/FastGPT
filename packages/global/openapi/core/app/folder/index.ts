import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  CreateAppFolderBodySchema,
  CreateAppFolderResponseSchema,
  GetAppFolderPathQuerySchema,
  GetAppFolderPathResponseSchema
} from './api';

export const AppFolderPath: OpenAPIPath = {
  '/core/app/folder/create': {
    post: {
      summary: '创建应用文件夹',
      description: '在根目录或指定父级文件夹下创建应用文件夹或工具文件夹',
      tags: [TagsMap.appFolder],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateAppFolderBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建应用文件夹',
          content: {
            'application/json': {
              schema: CreateAppFolderResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/folder/path': {
    get: {
      summary: '获取应用文件夹路径',
      description: '获取指定应用或文件夹的父级路径',
      tags: [TagsMap.appFolder],
      requestParams: {
        query: GetAppFolderPathQuerySchema
      },
      responses: {
        200: {
          description: '成功获取应用文件夹路径',
          content: {
            'application/json': {
              schema: GetAppFolderPathResponseSchema
            }
          }
        }
      }
    }
  }
};
