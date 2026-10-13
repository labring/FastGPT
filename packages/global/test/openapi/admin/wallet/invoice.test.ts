import { describe, expect, it } from 'vitest';
import {
  InvoiceItemSchema,
  InvoiceListBodySchema,
  InvoiceFinishDataSchema,
  InvoiceFinishFormSchema
} from '../../../../openapi/admin/wallet/bill/invoice/api';
import { AdminInvoicePath } from '../../../../openapi/admin/wallet/bill/invoice';
import { InvoiceStatusEnum } from '../../../../support/wallet/bill/invoice/constants';

describe('Admin invoice schemas', () => {
  const baseInvoice = {
    _id: '68ad85a7463006c963799a05',
    teamId: '68ad85a7463006c963799a06',
    teamName: 'Test Team',
    emailAddress: 'test@example.com',
    amount: 500,
    status: InvoiceStatusEnum.completed,
    createTime: new Date('2026-01-01T00:00:00.000Z')
  };

  it('accepts both ObjectId and custom string IDs in billIdList', () => {
    const withCustomStringBillId = InvoiceItemSchema.parse({
      ...baseInvoice,
      billIdList: ['legacy-order-12345', '68ad85a7463006c963799a07']
    });
    expect(withCustomStringBillId.billIdList).toEqual([
      'legacy-order-12345',
      '68ad85a7463006c963799a07'
    ]);
  });

  it('provides default pagination values for invoice list requests', () => {
    const parsed = InvoiceListBodySchema.parse({});
    expect(parsed.pageNum).toBe(1);
    expect(parsed.pageSize).toBe(10);

    const custom = InvoiceListBodySchema.parse({ pageNum: 2, pageSize: 20, search: 'demo' });
    expect(custom.pageNum).toBe(2);
    expect(custom.pageSize).toBe(20);
    expect(custom.search).toBe('demo');
  });

  it('validates invoice finish data and multipart form contracts', () => {
    const data = InvoiceFinishDataSchema.parse({ invoiceId: '68ad85a7463006c963799a05' });
    expect(data.invoiceId).toBe('68ad85a7463006c963799a05');

    expect(InvoiceFinishDataSchema.safeParse({}).success).toBe(false);

    const finishRoute = AdminInvoicePath['/proApi/admin/wallet/bill/invoice/finish']?.post;
    const multipartContent = finishRoute?.requestBody?.content?.['multipart/form-data'];
    expect(multipartContent?.schema).toBe(InvoiceFinishFormSchema);
    expect(multipartContent?.encoding?.data?.contentType).toBe('application/json');
  });
});
