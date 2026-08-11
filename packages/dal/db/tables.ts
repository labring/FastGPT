/** Mongo collection 与 SQL-like table 共用的物理名称。 */
export const tables = {
  user: 'users',
  team: 'teams',
  teamMember: 'team_members',
  teamMemberGroup: 'team_member_groups',
  teamOrg: 'team_orgs',
  tmpData: 'tmp_datas',
  teamDiscountCoupon: 'team_discount_coupons',
  teamEnterpriseAuth: 'team_enterprise_auths',
  teamEnterpriseAuthTask: 'team_enterprise_auth_tasks'
} as const;

export type TableName = (typeof tables)[keyof typeof tables];
