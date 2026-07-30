import { z } from 'zod';

export const AccountEmailUsernameSchema = z.email().max(254);
export const AccountPhoneUsernameSchema = z.string().regex(/^1[3456789]\d{9}$/);
export const AccountContactUsernameSchema = z.union([
  AccountEmailUsernameSchema,
  AccountPhoneUsernameSchema
]);
