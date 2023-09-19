import { getFileViewUrl } from '@/api/support/file';

export async function getFileAndOpen(fileId: string) {
  const url = await getFileViewUrl(fileId);
  const asPath = `${location.origin}${url}`;
  window.open(asPath, '_blank');
}
