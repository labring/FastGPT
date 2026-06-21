import { EnterpriseRoleEnum } from '@fastgpt/global/support/enterprise/rbac/constants';
import { MongoEnterpriseRoleBinding } from './schema';

export const normalizeEnterpriseRoles = (roles: string[] = []): EnterpriseRoleEnum[] => {
  const allowed = new Set(Object.values(EnterpriseRoleEnum));
  return Array.from(new Set(roles)).filter((role): role is EnterpriseRoleEnum =>
    allowed.has(role as EnterpriseRoleEnum)
  );
};

export const hasAnyEnterpriseRole = async ({
  teamId,
  userId,
  roles
}: {
  teamId: string;
  userId: string;
  roles: EnterpriseRoleEnum[];
}) => {
  const binding = await MongoEnterpriseRoleBinding.findOne({
    teamId,
    userId
  }).lean();

  if (!binding) return false;
  if (binding.roles.includes(EnterpriseRoleEnum.Owner)) return true;
  return roles.some((role) => binding.roles.includes(role));
};
