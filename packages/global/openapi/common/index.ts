import type { OpenAPIPath } from '../type';
import { CommonFilePath } from './file';
import { CommonSystemPath } from './system';

export const CommonPath: OpenAPIPath = {
  ...CommonFilePath,
  ...CommonSystemPath
};
