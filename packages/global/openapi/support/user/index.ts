import { UserInformPath } from './inform';
import type { OpenAPIPath } from '../../type';
import { UserAccountPath } from './account';
import { TeamPath } from './team';
import { UserAuditPath } from './audit';

export const UserPath: OpenAPIPath = {
  ...UserInformPath,
  ...UserAccountPath,
  ...TeamPath,
  ...UserAuditPath
};
