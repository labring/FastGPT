import z from 'zod';

export const EntityIdSchema = z.string().min(1);
export type EntityId = z.infer<typeof EntityIdSchema>;

export const tables = {
  user: 'users',

  team: 'teams',
  teamDiscountCoupon: 'team_discount_coupons',
  teamEnterpriseAuth: 'team_enterprise_auths',
  teamEnterpriseAuthTask: 'team_enterprise_auth_tasks'
} as const;
export type TableNames = (typeof tables)[keyof typeof tables];
