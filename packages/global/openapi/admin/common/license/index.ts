import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { ActiveLicenseBodySchema } from './api';

export const AdminLicensePath: OpenAPIPath = {
  '/admin/common/license/active': {
    post: {
      summary: '激活许可证',
      description: '使用许可证密钥激活 FastGPT 商业版',
      tags: [DevApiTagsMap.adminLicense],
      requestBody: {
        content: {
          'application/json': {
            schema: ActiveLicenseBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '激活成功',
          content: {
            'application/json': {
              schema: {}
            }
          }
        }
      }
    }
  },
  '/admin/common/license/auth': {
    get: {
      summary: '获取许可证信息',
      description: '获取当前激活的许可证信息。已认证返回完整信息，未认证仅返回公司名',
      tags: [DevApiTagsMap.adminLicense],
      responses: {
        200: {
          description: '成功获取许可证信息',
          content: {
            'application/json': {
              schema: {}
            }
          }
        }
      }
    }
  }
};
