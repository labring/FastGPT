import type { OpenAPIPath } from '../../type';
import { AdminInformPath } from './inform';
import { AdminAuditPath } from './audit';
import { AdminSystemMigrationsPath } from './migrations';
import { AdminInstanceConfigPath } from './instanceConfig/api';
import { AdminInstanceConfigProbePath } from './instanceConfig/probe';
import { AdminInstanceConfigTestDocumentParsePath } from './instanceConfig/testDocumentParse';
import { DevApiTagsMap } from '../../tag';
import { GetConfigResponseSchema } from './api';

export const AdminSettingsPath: OpenAPIPath = {
  '/proApi/admin/system/getConfig': {
    get: {
      summary: '获取系统配置',
      description: '获取 FastGPT 和 FastGPT Pro 的当前系统配置',
      tags: [DevApiTagsMap.adminSettings],
      responses: {
        200: {
          description: '成功获取系统配置',
          content: {
            'application/json': {
              schema: GetConfigResponseSchema
            }
          }
        }
      }
    }
  }
};

export const AdminSystemPath: OpenAPIPath = {
  ...AdminSettingsPath,
  ...AdminInformPath,
  ...AdminAuditPath,
  ...AdminSystemMigrationsPath,
  ...AdminInstanceConfigPath,
  ...AdminInstanceConfigProbePath,
  ...AdminInstanceConfigTestDocumentParsePath
};
