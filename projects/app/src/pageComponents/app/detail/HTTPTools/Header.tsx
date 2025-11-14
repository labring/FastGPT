import { Box, Flex } from '@chakra-ui/react';
import FolderPath from '@/components/common/folder/Path';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const Header = () => {
  const { t } = useTranslation();
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const router = useRouter();

  const { lastAppListRouteType } = useSystemStore();

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
        pathname: '/dashboard/tool',
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
            rootName={t('common:All')}
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
