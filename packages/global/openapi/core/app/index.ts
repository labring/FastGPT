import type { OpenAPIPath } from '../../type';
import { AppLogPath } from './log';
import { PublishChannelPath } from './publishChannel';
import { AppCommonPath } from './common';

export const AppPath: OpenAPIPath = {
  ...AppLogPath,
  ...PublishChannelPath,
  ...AppCommonPath
};
