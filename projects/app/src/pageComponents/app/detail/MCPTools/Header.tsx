import { Box, Button, Flex } from '@chakra-ui/react';
import FolderPath from '@/components/common/folder/Path';
import { useTranslation } from 'react-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { type McpToolConfigType } from '@fastgpt/global/core/app/type';
import { postUpdateMCPTools } from '@/web/core/app/api/plugin';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';

const Header = ({
  url,
  toolList,
  headerSecret
}: {
  url: string;
  toolList: McpToolConfigType[];
  headerSecret: StoreSecretValueType;
}) => {
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
        pathname: '/dashboard/apps',
        query: {
          parentId,
          type: lastAppListRouteType
        }
      });
    },
    [router, lastAppListRouteType]
  );

  const { runAsync: saveMCPTools, loading: isSavingMCPTools } = useRequest2(
    async () => {
      return await postUpdateMCPTools({ appId, url, toolList, headerSecret });
    },
    {
      successToast: t('common:update_success')
    }
  );

  return (
    <Box h={14}>
      {/* {!isPc && (
        <Flex justifyContent={'center'}>
          <RouteTab />
        </Flex>
      )} */}
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
        {/* {isPc && (
          <Box position={'absolute'} left={'50%'} transform={'translateX(-50%)'}>
            <RouteTab />
          </Box>
        )} */}
        <Button size={'sm'} isLoading={isSavingMCPTools} onClick={() => saveMCPTools()}>
          {t('common:Save')}
        </Button>
      </Flex>
    </Box>
  );
};

export default Header;
