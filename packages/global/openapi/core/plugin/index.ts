import type { OpenAPIPath } from '../../type';
import { MarketplacePath } from './marketplace';
import { PluginToolTagPath } from './toolTag';
import { PluginAdminPath } from './admin';

export const PluginPath: OpenAPIPath = {
  ...MarketplacePath,
  ...PluginToolTagPath,
  ...PluginAdminPath
};
