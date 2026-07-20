import { AdminInvoicePath } from './invoice';
import { AdminRefundPath } from './pay';
import type { OpenAPIPath } from '../../../../type';

export const AdminBillPath: OpenAPIPath = {
  ...AdminInvoicePath,
  ...AdminRefundPath
};
