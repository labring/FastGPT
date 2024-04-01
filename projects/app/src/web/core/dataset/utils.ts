import { getFileViewUrl } from '@/web/core/dataset/api';
import { strIsLink } from '@fastgpt/global/common/string/tools';

export async function getFileAndOpen(fileId: string) {
  if (strIsLink(fileId)) {
    return window.open(fileId, '_blank');
  }
  const url = await getFileViewUrl(fileId);
  const asPath = `${location.origin}${url}`;
  window.open(asPath, '_blank');
}
