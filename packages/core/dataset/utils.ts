import { datasetSpecialIds } from './constant';
import { strIsLink } from '@fastgpt/common/tools/str';

export function isSpecialFileId(id: string) {
  if (datasetSpecialIds.includes(id)) return true;
  if (strIsLink(id)) return true;
  return false;
}
