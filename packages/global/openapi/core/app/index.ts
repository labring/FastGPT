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
import { ToolPath } from './tool';
import { AppEvaluationPath } from './evaluation';
import { ToolSetPath } from './toolSet';

export const AppPath: OpenAPIPath = {
  ...AppCommonPath,
  ...AppFolderPath,
  ...AppPermissionPath,
  ...AppVersionPath,
  ...AppTemplatePath,
  ...AppEvaluationPath,
  ...ToolSetPath,
  ...AppLogPath,
  ...PublishChannelPath,
  ...McpToolsPath,
  ...HttpToolsPath,
  ...ToolPath
};
