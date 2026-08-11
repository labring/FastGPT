import type { OpenAPIPath } from '../type';
import { CommonFilePath } from './file';
import { CommonSystemPath } from './system';
import { CommonOtherPath } from './other';

export const CommonPath: OpenAPIPath = {
  ...CommonFilePath,
  ...CommonSystemPath,
  ...CommonOtherPath
};
