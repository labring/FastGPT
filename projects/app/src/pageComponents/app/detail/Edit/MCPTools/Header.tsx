import { Box, Button, Flex } from '@chakra-ui/react';
import FolderPath from '@/components/common/folder/Path';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

const Header = ({ onSave }: { onSave: () => Promise<void> }) => {
  const { t } = useTranslation();
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const router = useRouter();

  const { lastAppListRouteType } = useSystemStore();

  const { data: paths = [] } = useRequest(
    () => getAppFolderPath({ sourceId: appId, type: 'parent' }),
    {
      manual: false,
      refreshDeps: [appId]
    }
  );

  const onClickRoute = useCallback(
    (parentId: ParentIdType) => {
      router.push({
        pathname: '/dashboard/tool',
        query: {
          parentId: parentId || '',
          type: lastAppListRouteType
        }
      });
    },
    [router, lastAppListRouteType]
  );

  const { runAsync: saveMCPTools, loading: isSavingMCPTools } = useRequest(
    async () => await onSave(),
    {
      successToast: t('common:update_success')
    }
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
        <Button size={'sm'} isLoading={isSavingMCPTools} onClick={() => saveMCPTools()}>
          {t('common:Save')}
        </Button>
      </Flex>
    </Box>
  );
};

export default Header;
