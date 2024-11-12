import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getCollectionSource } from '@/web/core/dataset/api';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { ShareChatAuthProps } from '@fastgpt/global/support/permission/chat';

export function getCollectionSourceAndOpen({
  collectionId,
  shareId,
  outLinkUid
}: {
  collectionId: string;
} & ShareChatAuthProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { setLoading } = useSystemStore();

  return async () => {
    try {
      setLoading(true);

      const { value: url } = await getCollectionSource({ collectionId, shareId, outLinkUid });

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
        title: getErrText(error, t('common:error.fileNotFound')),
        status: 'error'
      });
    }
    setLoading(false);
  };
}
