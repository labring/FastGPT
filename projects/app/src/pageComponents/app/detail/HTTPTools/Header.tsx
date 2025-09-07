import { Box, Button, Flex, Text } from '@chakra-ui/react';
import FolderPath from '@/components/common/folder/Path';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { type HttpToolConfigType } from '@fastgpt/global/core/app/type';
import { putUpdateHttpPlugin } from '@/web/core/app/api/plugin';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';

const Header = ({
  url,
  toolList,
  headerSecret
}: {
  url: string;
  toolList: HttpToolConfigType[];
  headerSecret: StoreSecretValueType;
}) => {
  const { t } = useTranslation();
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const router = useRouter();

  const { lastAppListRouteType } = useSystemStore();

  const { loading: updatingToolList } = useRequest2(
    async () => {
      if (toolList.length === 0) return;

      return putUpdateHttpPlugin({
        appId: appDetail._id,
        name: appDetail.name,
        intro: appDetail.intro,
        pluginData: {
          ...appDetail.pluginData
        }
      });
    },
    {
      manual: true,
      refreshDeps: [toolList],
      debounceWait: 1000,
      onSuccess: () => {
        console.log('HTTP Tools updated successfully');
      },
      successToast: t('common:update_success'),
      errorToast: t('common:update_failed')
    }
  );

  const { data: paths = [] } = useRequest2(
    () => getAppFolderPath({ sourceId: appId, type: 'parent' }),
    {
      manual: false,
      refreshDeps: [appId]
    }
  );

  const onClickRoute = useCallback(
    (parentId: string) => {
      router.push({
        pathname: '/dashboard/apps',
        query: {
          parentId,
          type: lastAppListRouteType
        }
      });
    },
    [router, lastAppListRouteType]
  );

  return (
    <Box h={14}>
      <Flex w={'full'} alignItems={'center'} position={'relative'} h={'full'}>
        <Box flex={'1'}>
          <FolderPath
            rootName={t('app:all_apps')}
            paths={paths}
            hoverStyle={{ color: 'primary.600' }}
            onClick={onClickRoute}
            fontSize={'14px'}
          />
        </Box>
      </Flex>
    </Box>
  );
};

export default Header;
