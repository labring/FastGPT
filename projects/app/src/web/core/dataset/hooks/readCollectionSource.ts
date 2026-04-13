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
    try {
      setLoading(true);

      const { value: url } = await getCollectionSource(props);

      if (!url) {
        throw new Error('No file found');
      }

      if (url.startsWith('/')) {
        window.open(`${location.origin}${url}`, '_blank');
      } else {
        window.open(url, '_blank');
      }
    } catch (error) {
      toast({
        title: t(getErrText(error, t('common:error.fileNotFound'))),
        status: 'error'
      });
    }
    setLoading(false);
  };
}
