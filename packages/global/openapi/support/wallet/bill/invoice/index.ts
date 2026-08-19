import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  InvoiceDownloadFileContentSchema,
  InvoiceDownloadFileQuerySchema,
  InvoiceRecordsBodySchema,
  InvoiceRecordsResponseSchema,
  InvoiceSubmitBodySchema,
  InvoiceSubmitResponseSchema,
  GetTeamHeaderQuerySchema,
  GetTeamHeaderResponseSchema,
  UpdateTeamHeaderBodySchema,
  UpdateTeamHeaderResponseSchema,
  UnInvoiceListQuerySchema,
  UnInvoiceListResponseSchema
} from './api';

export const WalletInvoicePath: OpenAPIPath = {
  '/proApi/support/wallet/bill/invoice/account/getTeamHeader': {
    get: {
      summary: '获取团队发票抬头',
      description: '获取当前团队保存的发票抬头信息；尚未设置时返回空对象',
      tags: [DevApiTagsMap.walletInvoice],
      requestParams: { query: GetTeamHeaderQuerySchema },
      responses: {
        200: {
          description: '成功获取团队发票抬头',
          content: {
            'application/json': {
              schema: GetTeamHeaderResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/wallet/bill/invoice/account/updateHeader': {
    post: {
      summary: '更新团队发票抬头',
      description: '更新当前团队的发票抬头信息，仅团队所有者可以操作',
      tags: [DevApiTagsMap.walletInvoice],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateTeamHeaderBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '发票抬头更新成功',
          content: {
            'application/json': {
              schema: UpdateTeamHeaderResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/wallet/bill/invoice/downloadFile': {
    get: {
      summary: '下载发票文件',
      description: '下载当前团队的发票 PDF 文件，仅团队管理员可以操作',
      tags: [DevApiTagsMap.walletInvoice],
      requestParams: { query: InvoiceDownloadFileQuerySchema },
      responses: {
        200: {
          description: '成功返回发票 PDF 文件',
          content: { 'application/pdf': { schema: InvoiceDownloadFileContentSchema } }
        }
      }
    }
  },
  '/proApi/support/wallet/bill/invoice/records': {
    post: {
      summary: '获取发票记录',
      description: '分页获取当前团队提交过的发票申请记录',
      tags: [DevApiTagsMap.walletInvoice],
      requestBody: {
        content: { 'application/json': { schema: InvoiceRecordsBodySchema } }
      },
      responses: {
        200: {
          description: '成功返回发票记录',
          content: { 'application/json': { schema: InvoiceRecordsResponseSchema } }
        }
      }
    }
  },
  '/proApi/support/wallet/bill/invoice/submit': {
    post: {
      summary: '提交开票申请',
      description: '为指定的已支付订单提交发票申请，并校验订单金额和归属团队',
      tags: [DevApiTagsMap.walletInvoice],
      requestBody: {
        content: { 'application/json': { schema: InvoiceSubmitBodySchema } }
      },
      responses: {
        200: {
          description: '开票申请提交成功',
          content: { 'application/json': { schema: InvoiceSubmitResponseSchema } }
        }
      }
    }
  },
  '/proApi/support/wallet/bill/invoice/unInvoiceList': {
    get: {
      summary: '获取待开票订单',
      description: '获取当前团队中已支付且尚未开票的订单',
      tags: [DevApiTagsMap.walletInvoice],
      requestParams: { query: UnInvoiceListQuerySchema },
      responses: {
        200: {
          description: '成功返回待开票订单',
          content: { 'application/json': { schema: UnInvoiceListResponseSchema } }
        }
      }
    }
  }
};
