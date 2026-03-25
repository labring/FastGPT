import { UserInformPath } from './inform';
import type { OpenAPIPath } from '../../type';
import { UserAccountPath } from './account';

export const UserPath: OpenAPIPath = {
  ...UserInformPath,
  ...UserAccountPath
};
