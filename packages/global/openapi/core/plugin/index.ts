import type { OpenAPIPath } from '../../type';
import { MarketplacePath } from './marketplace';
import { PluginToolTagPath } from './toolTag';
import { PluginAdminPath } from './admin';
import { PluginTeamPath } from './team';
import { PluginDebugPath } from './debug';

export const PluginPath: OpenAPIPath = {
  ...MarketplacePath,
  ...PluginToolTagPath,
  ...PluginAdminPath,
  ...PluginTeamPath,
  ...PluginDebugPath
};
