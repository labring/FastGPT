import { UserPath } from './user';
import type { OpenAPIPath } from '../type';
import { WalletPath } from './wallet';
import { ApiKeyPath } from './openapi';
import { CustomDomainPath } from './customDomain';
import { OutLinkPath } from './outLink';
import { McpPath } from './mcpServer';
import { PermissionPath } from './permission';

export const SupportPath: OpenAPIPath = {
  ...UserPath,
  ...WalletPath,
  ...PermissionPath,
  ...ApiKeyPath,
  ...CustomDomainPath,
  ...OutLinkPath,
  ...McpPath
};
