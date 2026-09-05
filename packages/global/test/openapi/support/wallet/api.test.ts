import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../../openapi/provider/devapi';
import { openAPIPaths, openAPITagGroups } from '../../../../openapi/path';
import { DevApiTagsMap } from '../../../../openapi/tag';
import { BillItemSchema } from '../../../../openapi/support/wallet/bill/api';
import { GetPaysResponseSchema } from '../../../../openapi/admin/routes/pays/api';
import {
  InvoiceRecordsResponseSchema,
  InvoiceSubmitBodySchema,
  UnInvoiceListResponseSchema
} from '../../../../openapi/support/wallet/bill/invoice/api';
import {
  BillPayWayEnum,
  BillStatusEnum,
  BillTypeEnum
} from '../../../../support/wallet/bill/constants';
import { BillSchema } from '../../../../support/wallet/bill/type';
import { InvoiceStatusEnum } from '../../../../support/wallet/bill/invoice/constants';

describe('wallet OpenAPI contracts', () => {
  const routes = {
    '/proApi/support/wallet/bill/balanceConversion': 'get',
    '/proApi/support/wallet/bill/cancel': 'post',
    '/proApi/support/wallet/bill/create': 'post',
    '/proApi/support/wallet/bill/detail': 'get',
    '/proApi/support/wallet/bill/invoice/downloadFile': 'get',
    '/proApi/support/wallet/bill/invoice/records': 'post',
    '/proApi/support/wallet/bill/invoice/submit': 'post',
    '/proApi/support/wallet/bill/invoice/unInvoiceList': 'get',
    '/proApi/support/wallet/bill/list': 'post',
    '/proApi/support/wallet/bill/pay/checkPayResult': 'get',
    '/proApi/support/wallet/bill/pay/updatePayment': 'put',
    '/proApi/support/wallet/coupon/redeem': 'get',
    '/proApi/support/wallet/discountCoupon/list': 'get',
    '/proApi/support/wallet/usage/exportUsage': 'post',
    '/proApi/support/wallet/usage/getDashboardData': 'post',
    '/proApi/support/wallet/usage/getUsage': 'post',
    '/proApi/support/wallet/bill/invoice/account/getTeamHeader': 'get',
    '/proApi/support/wallet/bill/invoice/account/updateHeader': 'post'
  } as const;

  it('registers all wallet routes with their real proApi paths and methods', () => {
    for (const [path, method] of Object.entries(routes)) {
      expect(
        openAPIDocument.paths?.[path]?.[method],
        `${method.toUpperCase()} ${path}`
      ).toBeDefined();
    }

    expect(openAPIPaths['/support/wallet/bill/create']).toBeUndefined();
    expect(openAPIPaths['/support/wallet/discountCoupon/list']).toBeUndefined();
    expect(
      openAPIPaths['/proApi/support/user/team/invoiceAccount/getTeamInvoiceHeader']
    ).toBeUndefined();
    expect(openAPIPaths['/proApi/support/user/team/invoiceAccount/update']).toBeUndefined();
  });

  it('separates orders, invoices, and usage records into different tags', () => {
    expect(openAPIDocument.paths?.['/proApi/support/wallet/bill/create']?.post?.tags).toEqual([
      DevApiTagsMap.walletBill
    ]);
    expect(
      openAPIDocument.paths?.['/proApi/support/wallet/bill/invoice/records']?.post?.tags
    ).toEqual([DevApiTagsMap.walletInvoice]);
    expect(openAPIDocument.paths?.['/proApi/support/wallet/usage/getUsage']?.post?.tags).toEqual([
      DevApiTagsMap.walletUsage
    ]);
    expect(
      openAPIDocument.paths?.['/proApi/support/wallet/bill/invoice/account/getTeamHeader']?.get
        ?.tags
    ).toEqual([DevApiTagsMap.walletInvoice]);
    const invoiceHeaderUpdate =
      openAPIDocument.paths?.['/proApi/support/wallet/bill/invoice/account/updateHeader'];
    expect(invoiceHeaderUpdate?.post?.tags).toEqual([DevApiTagsMap.walletInvoice]);
    expect(invoiceHeaderUpdate?.put).toBeUndefined();
  });

  it('documents updatePayment as PUT', () => {
    const path = openAPIDocument.paths?.['/proApi/support/wallet/bill/pay/updatePayment'];
    expect(path?.put).toBeDefined();
    expect(path?.post).toBeUndefined();
  });

  it('supports fractional subscription months in historical coupon bills', () => {
    const bill = BillItemSchema.parse({
      _id: '68ee0bd23d17260b7829b137',
      teamId: '68ee0bd23d17260b7829b138',
      tmbId: '68ee0bd23d17260b7829b139',
      createTime: '2026-01-01T00:00:00.000Z',
      orderId: 'coupon-order',
      status: BillStatusEnum.SUCCESS,
      type: BillTypeEnum.extraPoints,
      price: 0,
      metadata: {
        payWay: BillPayWayEnum.coupon,
        month: '12.17'
      }
    });

    expect(bill.metadata.month).toBe(12.17);
  });

  it.each([undefined, {}])('normalizes legacy bill metadata %j', (metadata) => {
    const bill = BillItemSchema.parse({
      _id: '68ee0bd23d17260b7829b137',
      teamId: '68ee0bd23d17260b7829b138',
      tmbId: '68ee0bd23d17260b7829b139',
      createTime: '2024-02-01T00:00:00.000Z',
      orderId: 'legacy-balance-order',
      status: BillStatusEnum.SUCCESS,
      type: BillTypeEnum.balance,
      price: 100000,
      metadata
    });

    expect(bill.metadata).toEqual({});
  });

  it('preserves paid amount across the database and admin response contracts', () => {
    const bill = {
      _id: '68ee0bd23d17260b7829b137',
      teamId: '68ee0bd23d17260b7829b138',
      tmbId: '68ee0bd23d17260b7829b139',
      createTime: '2026-01-01T00:00:00.000Z',
      orderId: 'bank-coupon-order',
      status: BillStatusEnum.SUCCESS,
      type: BillTypeEnum.extraPoints,
      price: 100,
      paidAmount: 80,
      metadata: {
        payWay: BillPayWayEnum.bank
      }
    };

    expect(BillSchema.parse(bill)).toMatchObject({ paidAmount: 80 });
    expect(
      GetPaysResponseSchema.parse({
        list: [{ ...bill, username: 'billing@example.com' }],
        total: 1
      }).list[0]
    ).toMatchObject({ paidAmount: 80 });
  });

  it('keeps Mongo bill IDs when preparing an invoice submission', () => {
    const billId = '68ee0bd23d17260b7829b137';
    const bills = UnInvoiceListResponseSchema.parse([
      {
        _id: billId,
        price: 9900,
        type: BillTypeEnum.standSubPlan,
        createTime: '2026-01-01T00:00:00.000Z',
        orderId: 'invoice-order'
      }
    ]);

    expect(bills[0]._id).toBe(billId);
    expect(InvoiceSubmitBodySchema.shape.billIdList.parse(bills.map((bill) => bill._id))).toEqual([
      billId
    ]);
  });

  it('fills the legacy missing invoice contact phone with a placeholder', () => {
    const response = InvoiceRecordsResponseSchema.parse({
      list: [
        {
          _id: '68ad85a7463006c963799a01',
          teamId: '68ad85a7463006c963799a02',
          amount: 9900,
          status: InvoiceStatusEnum.submitted,
          createTime: '2026-01-01T00:00:00.000Z',
          billIdList: ['68ad85a7463006c963799a03'],
          teamName: 'Example Team',
          unifiedCreditCode: '91110000MA1234567X',
          needSpecialInvoice: false,
          emailAddress: 'billing@example.com'
        }
      ],
      total: 1
    });

    expect(response.list[0].contactPhone).toBe('-');
  });

  it('omits empty request and response placeholders', () => {
    const balanceConversion =
      openAPIDocument.paths?.['/proApi/support/wallet/bill/balanceConversion']?.get;
    const cancel = openAPIDocument.paths?.['/proApi/support/wallet/bill/cancel']?.post;
    const submit = openAPIDocument.paths?.['/proApi/support/wallet/bill/invoice/submit']?.post;
    const updateHeader =
      openAPIDocument.paths?.['/proApi/support/wallet/bill/invoice/account/updateHeader']?.post;

    expect(balanceConversion?.parameters).toBeUndefined();
    expect(balanceConversion?.responses?.[200]?.content).toBeUndefined();
    expect(cancel?.responses?.[200]?.content).toBeUndefined();
    expect(submit?.responses?.[200]?.content).toBeUndefined();
    expect(updateHeader?.responses?.[200]?.content).toBeUndefined();
  });

  it('groups wallet tags under auxiliary wallet', () => {
    const walletGroup = openAPITagGroups.find((group) => group.name === '辅助-钱包');
    const userGroup = openAPITagGroups.find((group) => group.name === '辅助-用户体系');

    expect(walletGroup?.tags).toEqual([
      DevApiTagsMap.walletBill,
      DevApiTagsMap.walletUsage,
      DevApiTagsMap.walletInvoice,
      DevApiTagsMap.walletDiscountCoupon
    ]);
    expect(userGroup?.tags).not.toEqual(
      expect.arrayContaining([
        DevApiTagsMap.walletBill,
        DevApiTagsMap.walletUsage,
        DevApiTagsMap.walletInvoice,
        DevApiTagsMap.walletDiscountCoupon
      ])
    );
  });
});
