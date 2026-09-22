import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import { InvoiceListBodySchema, InvoiceListResponseSchema, InvoiceFinishBodySchema } from './api';
import {
  InvoiceDownloadFileContentSchema,
  InvoiceDownloadFileQuerySchema
} from '../../../../support/wallet/bill/invoice/api';

export const AdminInvoicePath: OpenAPIPath = {
  '/proApi/admin/wallet/bill/invoice/list': {
    post: {
      summary: '获取发票列表',
      description: '分页获取发票申请列表，支持按团队名称搜索',
      tags: [DevApiTagsMap.adminWalletInvoice],
      requestBody: {
        content: {
          'application/json': {
            schema: InvoiceListBodySchema
          }
        }
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
  '/proApi/admin/wallet/bill/invoice/finish': {
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
  },
  '/proApi/admin/wallet/bill/invoice/downloadFile': {
    get: {
      summary: '下载发票文件',
      description: '按发票 ID 下载后台已开具的 PDF 文件，需要管理员权限',
      tags: [DevApiTagsMap.adminWalletInvoice],
      requestParams: {
        query: InvoiceDownloadFileQuerySchema
      },
      responses: {
        200: {
          description: '发票 PDF 文件',
          content: {
            'application/pdf': {
              schema: InvoiceDownloadFileContentSchema
            }
          }
        }
      }
    }
  }
};
