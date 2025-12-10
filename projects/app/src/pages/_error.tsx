import { useRouter } from 'next/router';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Box } from '@chakra-ui/react';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { webPushTrack } from '@/web/common/middle/tracks/utils';
import { useTranslation } from 'next-i18next';
import { errorLogger } from '@/web/common/utils/errorLogger';
import { useMount } from 'ahooks';

function Error() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { lastRoute, llmModelList, embeddingModelList } = useSystemStore();

  useMount(() => {
    // Send track
    webPushTrack.clientError({
      route: lastRoute,
      log: errorLogger.getLogs()
    });

    let modelError = false;
    if (llmModelList.length === 0) {
      modelError = true;
      toast({
        title: '未配置语言模型',
        status: 'error'
      });
    } else if (!llmModelList.some((item) => item.datasetProcess)) {
      modelError = true;
      toast({
        title: '未配置知识库文件处理模型',
        status: 'error'
      });
    }
    if (embeddingModelList.length === 0) {
      modelError = true;
      toast({
        title: '未配置索引模型',
        status: 'error'
      });
    }

    setTimeout(() => {
      if (modelError) {
        router.push('/account/model');
      } else {
        router.push('/dashboard/agent');
      }
    }, 2000);
  });

  return <Box whiteSpace={'pre-wrap'}>{t('common:page_error')}</Box>;
}

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context)) }
  };
}

export default Error;
