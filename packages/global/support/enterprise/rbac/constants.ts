export enum EnterpriseRoleEnum {
  Owner = 'enterprise_owner',
  AuditAdmin = 'audit_admin',
  KnowledgeAdmin = 'knowledge_admin'
}

export const EnterpriseRoleMap = {
  [EnterpriseRoleEnum.Owner]: {
    label: 'Enterprise owner',
    description: 'Full enterprise operations access.'
  },
  [EnterpriseRoleEnum.AuditAdmin]: {
    label: 'Audit admin',
    description: 'Can query and export enterprise audit logs.'
  },
  [EnterpriseRoleEnum.KnowledgeAdmin]: {
    label: 'Knowledge admin',
    description: 'Can reconcile enterprise knowledge sync schedulers.'
  }
} as const;
