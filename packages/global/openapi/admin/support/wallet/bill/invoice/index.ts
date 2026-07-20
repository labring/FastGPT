import type { OpenAPIPath } from '../../../../../type';
import { DevApiTagsMap } from '../../../../../tag';
import { InvoiceListBodySchema, InvoiceListResponseSchema, InvoiceFinishBodySchema } from './api';

export const AdminInvoicePath: OpenAPIPath = {
  '/admin/support/wallet/bill/invoice/list': {
    get: {
      summary: '获取发票列表',
      description: '分页获取发票申请列表，支持按团队名称搜索',
      tags: [DevApiTagsMap.adminWalletInvoice],
      requestParams: {
        query: InvoiceListBodySchema
      },
      responses: {
        200: {
          description: '成功获取发票列表',
          content: {
            'application/json': {
              schema: InvoiceListResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/support/wallet/bill/invoice/finish': {
    post: {
      summary: '完成发票开具',
      description: '上传发票文件完成发票开具，需使用 multipart/form-data',
      tags: [DevApiTagsMap.adminWalletInvoice],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: InvoiceFinishBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '发票开具成功',
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
