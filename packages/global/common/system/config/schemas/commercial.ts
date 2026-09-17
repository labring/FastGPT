import z from 'zod';
import { urlWithDefault } from './primitives';

export const CommercialConfigSchema = z.strictObject({
  showCoupon: z.boolean().default(false),
  showDiscountCoupon: z.boolean().default(false),
  payFormUrl: urlWithDefault(),
  agentSandboxFreeTip: z.boolean().default(false)
});
