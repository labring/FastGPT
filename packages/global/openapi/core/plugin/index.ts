import type { OpenAPIPath } from '../../type';
import { MarketplacePath } from './marketplace';
import { PluginToolTagPath } from './toolTag';

export const PluginPath: OpenAPIPath = {
  ...MarketplacePath,
  ...PluginToolTagPath
};
