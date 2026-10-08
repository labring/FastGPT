import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  ModalBody,
  ModalFooter,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo } from 'react';

import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBackButton from '@fastgpt/web/components/common/MyBackButton';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import RouteTab from '../RouteTab';

import { useSystemStore } from '@/web/common/system/useSystemStore';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useToast } from '@fastgpt/web/hooks/useToast';
import PublishHistories from '../PublishHistoriesSlider';
import SaveButton from '../Workflow/components/SaveButton';
import AppCard from '../WorkflowComponents/AppCard';
import { useWorkflowModalValue } from '../WorkflowComponents/Flow/panels/workflowPanelState';
import {
  useWorkflowHistory,
  useWorkflowPersistence
} from '@/web/core/workflow/editor/session/workflowSession';
import type { WorkflowVersionEntry } from '@/web/core/workflow/editor/session/workflowHistory';

const Header = () => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const router = useRouter();
  const { toast: backSaveToast } = useToast({
    containerStyle: {
      mt: '60px'
    }
  });

  const onSaveApp = useContextSelector(AppContext, (v) => v.onSaveApp);
  const currentTab = useContextSelector(AppContext, (v) => v.currentTab);
  const parentId = useContextSelector(AppContext, (v) => v.appDetail.parentId);
  const {
    isOpen: isOpenBackConfirm,
    onOpen: onOpenBackConfirm,
    onClose: onCloseBackConfirm
  } = useDisclosure();

  const { serializeWorkflowAndCheck: flowData2StoreDataAndCheck } = useWorkflowPersistence();

  const openWorkflowTest = useWorkflowModalValue((v) => v.openWorkflowTest);
  const { versions, switchVersion, switchCloudVersion } = useWorkflowHistory();
  const { isSaved, leaveSaveSign, serializeWorkflow, markSaved } = useWorkflowPersistence();
  const leaveSaveSignRef = leaveSaveSign;

  const activePanel = useWorkflowModalValue((v) => v.activePanel);
  const openPanel = useWorkflowModalValue((v) => v.openPanel);
  const closePanel = useWorkflowModalValue((v) => v.closePanel);
  const showHistoryModal = activePanel === 'history';

  const { lastAppListRouteType } = useSystemStore();

  const { runAsync: onClickSave, loading } = useRequest(
    async ({
      isPublish,
      versionName = formatTime2YMDHMS(new Date())
    }: {
      isPublish?: boolean;
      versionName?: string;
    }) => {
      // 序列化时捕获内容版本；只有保存成功才回填，请求期间的新编辑仍算未保存。
      const data = serializeWorkflow();
      if (data) {
        await onSaveApp({
          ...data,
          isPublish,
          versionName,
          //@ts-ignore
          version: 'v2'
        });
        markSaved();
      }
    },
    {
      manual: true,
      refreshDeps: [onSaveApp, markSaved, serializeWorkflow]
    }
  );

  const onBack = useCallback(async () => {
    leaveSaveSignRef.current = false;
    router.push({
      pathname: '/dashboard/tool',
      query: {
        parentId,
        type: lastAppListRouteType
      }
    });
  }, [lastAppListRouteType, leaveSaveSignRef, parentId, router]);

  const Render = useMemo(() => {
    return (
      <>
        {!isPc && (
          <Flex pt={2} justifyContent={'center'}>
            <RouteTab />
          </Flex>
        )}
        <Flex
          mt={[2, 0]}
          pl={[2, 4]}
          pr={[2, 6]}
          alignItems={['flex-start', 'center']}
          userSelect={'none'}
          h={['auto', '67px']}
          flexWrap={'wrap'}
          position={'fixed'}
          top={0}
          left={0}
          right={0}
          zIndex={100}
          {...(currentTab === TabEnum.appEdit
            ? {
                bg: 'rgba(255, 255, 255, 0.70)',
                backdropFilter: 'blur(6px)'
              }
            : {
                bg: 'transparent',
                borderBottomColor: 'transparent'
              })}
        >
          {/* back */}
          <MyBackButton onClick={isSaved ? onBack : onOpenBackConfirm} />

          {/* app info */}
          <Box ml={1}>
            <AppCard isSaved={isSaved} showSaveStatus />
          </Box>

          {isPc && (
            <Box position={'absolute'} left={'50%'} transform={'translateX(-50%)'}>
              <RouteTab />
            </Box>
          )}
          <Box flex={1} />

          {currentTab === TabEnum.appEdit && (
            <HStack flexDirection={['column', 'row']} spacing={[2, 3]}>
              <IconButton
                icon={<MyIcon name={'history'} w={'18px'} />}
                aria-label={''}
                size={'sm'}
                w={'34px'}
                h={'34px'}
                variant={'whitePrimary'}
                onClick={() => (showHistoryModal ? closePanel() : openPanel('history'))}
              />
              <Button
                leftIcon={<MyIcon name={'core/workflow/debug'} w={['14px', '16px']} />}
                w={'81px'}
                h={'34px'}
                variant={'whitePrimary'}
                flexShrink={0}
                onClick={async () => {
                  const data = await flowData2StoreDataAndCheck();
                  if (data) {
                    openWorkflowTest(data);
                  }
                }}
              >
                {t('common:core.workflow.Run')}
              </Button>
              <SaveButton
                colorSchema={'black'}
                isLoading={loading}
                isDisabled={showHistoryModal}
                onClickSave={onClickSave}
                checkData={async () => !!(await flowData2StoreDataAndCheck())}
              />
            </HStack>
          )}
        </Flex>
      </>
    );
  }, [
    isPc,
    currentTab,
    isSaved,
    onBack,
    onOpenBackConfirm,
    showHistoryModal,
    t,
    loading,
    onClickSave,
    openPanel,
    closePanel,
    flowData2StoreDataAndCheck,
    openWorkflowTest
  ]);

  return (
    <>
      {Render}
      {currentTab === TabEnum.appEdit && (
        <PublishHistories<WorkflowVersionEntry>
          isOpen={showHistoryModal}
          onClose={() => {
            closePanel();
          }}
          past={versions}
          onSwitchCloudVersion={switchCloudVersion}
          onSwitchTmpVersion={switchVersion}
        />
      )}

      <MyModal
        isOpen={isOpenBackConfirm}
        onClose={onCloseBackConfirm}
        iconSrc="common/warn"
        iconColor="#F79009"
        title={t('common:Exit')}
        w={'400px'}
      >
        <ModalBody>
          <Box>{t('workflow:workflow.exit_tips')}</Box>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant={'whiteDanger'} onClick={onBack}>
            {t('common:exit_directly')}
          </Button>
          <Button
            isLoading={loading}
            onClick={async () => {
              try {
                await onClickSave({});
                onCloseBackConfirm();
                onBack();
                backSaveToast({
                  status: 'success',
                  title: t('app:saved_success'),
                  position: 'top-right'
                });
              } catch {}
            }}
          >
            {t('common:Save_and_exit')}
          </Button>
        </ModalFooter>
      </MyModal>
    </>
  );
};

export default React.memo(Header);
