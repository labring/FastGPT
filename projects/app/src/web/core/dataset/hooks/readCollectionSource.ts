import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getCollectionSource } from '@/web/core/dataset/api/collection';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import type { ReadCollectionSourceBodyType as readCollectionSourceBody } from '@fastgpt/global/openapi/core/dataset/collection/api';

export function getCollectionSourceAndOpen(
  props: { collectionId: string } & readCollectionSourceBody
) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { setLoading } = useSystemStore();

  return async () => {
    const newWindow = window.open('', '_blank');

    try {
      setLoading(true);

      const { value: url } = await getCollectionSource(props);

      if (!url) {
        throw new Error('No file found');
      }

      const target = url.startsWith('/') ? `${location.origin}${url}` : url;

      if (newWindow) {
        newWindow.location.href = target;
      } else {
        location.href = target;
      }
    } catch (error) {
      newWindow?.close();
      toast({
        title: t(getErrText(error, t('common:error.fileNotFound'))),
        status: 'error'
      });
    }
    setLoading(false);
  };
}
