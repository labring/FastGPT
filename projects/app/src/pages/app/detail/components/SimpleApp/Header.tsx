import React, { useCallback } from 'react';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import FolderPath from '@/components/common/folder/Path';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { Box, Button, Flex } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import RouteTab from '../RouteTab';
import { useI18n } from '@/web/context/I18n';
import { useTranslation } from 'next-i18next';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { UseFormReturn } from 'react-hook-form';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { form2AppWorkflow } from '@/web/core/app/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { TabEnum } from '../context';

const Header = ({ editForm }: { editForm: UseFormReturn<AppSimpleEditFormType, any> }) => {
  const { appT } = useI18n();
  const { t } = useTranslation();
  const { isPc } = useSystemStore();
  const router = useRouter();
  const { appId, onPublish, currentTab } = useContextSelector(AppContext, (v) => v);

  const { handleSubmit } = editForm;

  const { data: paths = [] } = useRequest2(() => getAppFolderPath(appId), {
    manual: false,
    refreshDeps: [appId]
  });
  const onclickRoute = useCallback(
    (parentId: string) => {
      router.push({
        pathname: '/app/list',
        query: {
          parentId
        }
      });
    },
    [router]
  );

  const onSubmitPublish = useCallback(
    async (data: AppSimpleEditFormType) => {
      const { nodes, edges } = form2AppWorkflow(data);
      await onPublish({
        nodes,
        edges,
        chatConfig: data.chatConfig,
        type: AppTypeEnum.simple
      });
    },
    [onPublish]
  );

  return (
    <Box>
      {!isPc && (
        <Flex pt={2} justifyContent={'center'}>
          <RouteTab />
        </Flex>
      )}
      <Flex pl={2} pt={[2, 3]} alignItems={'flex-start'} position={'relative'}>
        <Box flex={'1'}>
          <FolderPath paths={paths} hoverStyle={{ color: 'primary.600' }} onClick={onclickRoute} />
        </Box>
        {isPc && (
          <Box position={'absolute'} left={'50%'} transform={'translateX(-50%)'}>
            <RouteTab />
          </Box>
        )}
        {currentTab === TabEnum.appEdit && (
          <Box>
            <PopoverConfirm
              showCancel
              content={t('core.app.Publish Confirm')}
              Trigger={<Button>{t('core.app.Publish')}</Button>}
              onConfirm={() => handleSubmit(onSubmitPublish)()}
            />
          </Box>
        )}
      </Flex>
    </Box>
  );
};

export default Header;
