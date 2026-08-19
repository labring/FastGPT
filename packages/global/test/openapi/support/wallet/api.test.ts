import { describe, expect, it } from 'vitest';
import { openAPIDocument } from '../../../../openapi/provider/devapi';
import { openAPIPaths, openAPITagGroups } from '../../../../openapi/path';
import { DevApiTagsMap } from '../../../../openapi/tag';

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
