import type { OpenAPIPath } from '../../../type';
import { AdminTemplatePath } from './templates';
import { AdminTemplateTypePath } from './templateType';

export const AdminAppPath: OpenAPIPath = {
  ...AdminTemplatePath,
  ...AdminTemplateTypePath
};
