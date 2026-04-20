import { UserInformPath } from './inform';
import type { OpenAPIPath } from '../../type';
import { UserAccountPath } from './account';
import { TeamPath } from './team';

export const UserPath: OpenAPIPath = {
  ...UserInformPath,
  ...UserAccountPath,
  ...TeamPath
};
