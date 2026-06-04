import {
  DeleteMarketplacePkgBodySchema,
  type DeleteMarketplacePkgBodyType
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import { pluginRepo } from '../plugin/repo';
import { refreshToolList } from './data';

export const deleteMarketplacePkg = async (input: DeleteMarketplacePkgBodyType) => {
  const data = DeleteMarketplacePkgBodySchema.parse(input);
  const result = await pluginRepo.deleteToolVersion(data);

  await refreshToolList();

  return result;
};
