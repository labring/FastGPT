import type { OpenAPIPath } from '../../type';
import { AppLogPath } from './log';
import { PublishChannelPath } from './publishChannel';
import { AppCommonPath } from './common';
import { McpToolsPath } from './mcpTools';
import { HttpToolsPath } from './httpTools';
import { AppFolderPath } from './folder';
import { AppVersionPath } from './version';
import { AppTemplatePath } from './template';
import { AppPermissionPath } from './permission';

export const AppPath: OpenAPIPath = {
  ...AppCommonPath,
  ...AppFolderPath,
  ...AppPermissionPath,
  ...AppVersionPath,
  ...AppTemplatePath,
  ...AppLogPath,
  ...PublishChannelPath,
  ...McpToolsPath,
  ...HttpToolsPath
};
