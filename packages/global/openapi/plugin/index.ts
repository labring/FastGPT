import type { OpenAPIPath } from '../type';
import { DevApiTagsMap } from '../tag';
import {
  InvokeAuthorizationHeaderSchema,
  InvokeFileUploadFormSchema,
  InvokeFileUploadResponseSchema,
  InvokeUserInfoResponseSchema
} from './invoke';

export const InvokePath: OpenAPIPath = {
  '/invoke/fileUpload': {
    post: {
      summary: '上传反向调用文件',
      description: '插件通过反向调用凭证上传文件到当前对话的文件目录',
      tags: [DevApiTagsMap.reverseInvokePlugin],
      requestParams: {
        header: InvokeAuthorizationHeaderSchema
      },
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: InvokeFileUploadFormSchema
          }
        }
      },
      responses: {
        200: {
          description: '文件上传成功',
          content: {
            'application/json': {
              schema: InvokeFileUploadResponseSchema
            }
          }
        }
      }
    }
  },
  '/invoke/userInfo': {
    post: {
      summary: '获取反向调用用户信息',
      description: '插件通过反向调用凭证获取当前运行上下文中的用户、组织和群组信息',
      tags: [DevApiTagsMap.reverseInvokePlugin],
      requestParams: {
        header: InvokeAuthorizationHeaderSchema
      },
      responses: {
        200: {
          description: '成功返回用户信息',
          content: {
            'application/json': {
              schema: InvokeUserInfoResponseSchema
            }
          }
        }
      }
    }
  }
};
