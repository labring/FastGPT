import type { OpenAPIPath } from '../../type';
import { AppLogPath } from './log';
import { PublishChannelPath } from './publishChannel';
import { AppCommonPath } from './common';
import { McpToolsPath } from './mcpTools';

export const AppPath: OpenAPIPath = {
  ...AppLogPath,
  ...PublishChannelPath,
  ...AppCommonPath,
  ...McpToolsPath
};
