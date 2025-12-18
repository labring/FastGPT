import type { OpenAPIPath } from '../../type';
import { AppLogPath } from './log';
import { PublishChannelPath } from './publishChannel';

export const AppPath: OpenAPIPath = {
  ...AppLogPath,
  ...PublishChannelPath
};
