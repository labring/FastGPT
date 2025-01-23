import React, { useCallback, useMemo } from 'react';
import {
  Box,
  Flex,
  Button,
  IconButton,
  HStack,
  ModalBody,
  ModalFooter,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../WorkflowComponents/context';
import { AppContext, TabEnum } from '../context';
import RouteTab from '../RouteTab';
import { useRouter } from 'next/router';

import AppCard from '../WorkflowComponents/AppCard';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import SaveButton from './components/SaveButton';
import PublishHistories from '../PublishHistoriesSlider';
import { WorkflowEventContext } from '../WorkflowComponents/context/workflowEventContext';
import { WorkflowStatusContext } from '../WorkflowComponents/context/workflowStatusContext';

const Header = () => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const router = useRouter();
  const { toast: backSaveToast } = useToast({
    containerStyle: {
      mt: '60px'
    }
  });

  const { appDetail, onSaveApp, currentTab } = useContextSelector(AppContext, (v) => v);
  const isV2Workflow = appDetail?.version === 'v2';
  const {
    isOpen: isOpenBackConfirm,
    onOpen: onOpenBackConfirm,
    onClose: onCloseBackConfirm
  } = useDisclosure();

  const flowData2StoreData = useContextSelector(WorkflowContext, (v) => v.flowData2StoreData);
  const flowData2StoreDataAndCheck = useContextSelector(
    WorkflowContext,
    (v) => v.flowData2StoreDataAndCheck
  );
  const setWorkflowTestData = useContextSelector(WorkflowContext, (v) => v.setWorkflowTestData);
  const past = useContextSelector(WorkflowContext, (v) => v.past);
  const setPast = useContextSelector(WorkflowContext, (v) => v.setPast);
  const onSwitchTmpVersion = useContextSelector(WorkflowContext, (v) => v.onSwitchTmpVersion);
  const onSwitchCloudVersion = useContextSelector(WorkflowContext, (v) => v.onSwitchCloudVersion);

  const showHistoryModal = useContextSelector(WorkflowEventContext, (v) => v.showHistoryModal);
  const setShowHistoryModal = useContextSelector(
    WorkflowEventContext,
    (v) => v.setShowHistoryModal
  );

  const isSaved = useContextSelector(WorkflowStatusContext, (v) => v.isSaved);
  const leaveSaveSign = useContextSelector(WorkflowStatusContext, (v) => v.leaveSaveSign);

  const { lastAppListRouteType } = useSystemStore();

  const { runAsync: onClickSave, loading } = useRequest2(
    async ({
      isPublish,
      versionName = formatTime2YMDHMS(new Date())
    }: {
      isPublish?: boolean;
      versionName?: string;
    }) => {
      const data = flowData2StoreData();

      if (data) {
        await onSaveApp({
          ...data,
          isPublish,
          versionName,
          chatConfig: appDetail.chatConfig,
          //@ts-ignore
          version: 'v2'
        });
        // Mark the current snapshot as saved
        setPast((prevPast) =>
          prevPast.map((item, index) =>
            index === 0
              ? {
                  ...item,
                  isSaved: true
                }
              : item
          )
        );
      }
    }
  );

  const onBack = useCallback(async () => {
    leaveSaveSign.current = false;
    router.push({
      pathname: '/app/list',
      query: {
        parentId: appDetail.parentId,
        type: lastAppListRouteType
      }
    });
  }, [appDetail.parentId, lastAppListRouteType, leaveSaveSign, router]);

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
          borderBottom={'base'}
          alignItems={['flex-start', 'center']}
          userSelect={'none'}
          h={['auto', '67px']}
          flexWrap={'wrap'}
          {...(currentTab === TabEnum.appEdit
            ? {
                bg: 'myGray.25'
              }
            : {
                bg: 'transparent',
                borderBottomColor: 'transparent'
              })}
        >
          {/* back */}
          <Box
            _hover={{
              bg: 'myGray.200'
            }}
            p={0.5}
            borderRadius={'sm'}
          >
            <MyIcon
              name={'common/leftArrowLight'}
              w={6}
              cursor={'pointer'}
              onClick={isSaved ? onBack : onOpenBackConfirm}
            />
          </Box>

          {/* app info */}
          <Box ml={1}>
            <AppCard isSaved={isSaved} showSaveStatus={isV2Workflow} />
          </Box>

          {isPc && (
            <Box position={'absolute'} left={'50%'} transform={'translateX(-50%)'}>
              <RouteTab />
            </Box>
          )}
          <Box flex={1} />

          {currentTab === TabEnum.appEdit && (
            <HStack flexDirection={['column', 'row']} spacing={[2, 3]}>
              {!showHistoryModal && (
                <IconButton
                  icon={<MyIcon name={'history'} w={'18px'} />}
                  aria-label={''}
                  size={'sm'}
                  w={'30px'}
                  variant={'whitePrimary'}
                  onClick={() => {
                    setShowHistoryModal(true);
                  }}
                />
              )}
              <Button
                size={'sm'}
                leftIcon={<MyIcon name={'core/workflow/debug'} w={['14px', '16px']} />}
                variant={'whitePrimary'}
                onClick={() => {
                  const data = flowData2StoreDataAndCheck();
                  if (data) {
                    setWorkflowTestData(data);
                  }
                }}
              >
                {t('common:core.workflow.Run')}
              </Button>
              {!showHistoryModal && (
                <SaveButton
                  isLoading={loading}
                  onClickSave={onClickSave}
                  checkData={flowData2StoreDataAndCheck}
                />
              )}
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
    isV2Workflow,
    showHistoryModal,
    t,
    loading,
    onClickSave,
    flowData2StoreDataAndCheck,
    setShowHistoryModal,
    setWorkflowTestData
  ]);

  return (
    <>
      {Render}
      {showHistoryModal && isV2Workflow && currentTab === TabEnum.appEdit && (
        <PublishHistories
          onClose={() => {
            setShowHistoryModal(false);
          }}
          past={past}
          onSwitchCloudVersion={onSwitchCloudVersion}
          onSwitchTmpVersion={onSwitchTmpVersion}
        />
      )}

      <MyModal
        isOpen={isOpenBackConfirm}
        onClose={onCloseBackConfirm}
        iconSrc="common/warn"
        title={t('common:common.Exit')}
        w={'400px'}
      >
        <ModalBody>
          <Box>{t('workflow:workflow.exit_tips')}</Box>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant={'whiteDanger'} onClick={onBack}>
            {t('common:common.Exit Directly')}
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
              } catch (error) {}
            }}
          >
            {t('common:common.Save_and_exit')}
          </Button>
        </ModalFooter>
      </MyModal>
    </>
  );
};

export default React.memo(Header);
