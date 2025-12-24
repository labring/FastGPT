import { UserPath } from './user';
import type { OpenAPIPath } from '../type';
import { WalletPath } from './wallet';
import { ApiKeyPath } from './openapi';
import { CustomDomainPath } from './customDomain';

export const SupportPath: OpenAPIPath = {
  ...UserPath,
  ...WalletPath,
  ...ApiKeyPath,
  ...CustomDomainPath
};
