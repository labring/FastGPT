import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import dynamic from 'next/dynamic';

import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext, getWorkflowStore } from '../WorkflowComponents/context';
import { AppContext, TabEnum } from '../context';
import RouteTab from '../RouteTab';
import { useRouter } from 'next/router';

import AppCard from '../WorkflowComponents/AppCard';
import { uiWorkflow2StoreWorkflow } from '../WorkflowComponents/utils';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { compareSnapshot } from '@/web/core/workflow/utils';
import SaveAndPublishModal from '../WorkflowComponents/Flow/components/SaveAndPublish';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { useToast } from '@fastgpt/web/hooks/useToast';

const PublishHistories = dynamic(() => import('../WorkflowPublishHistoriesSlider'));

const Header = () => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const router = useRouter();
  const { toast } = useToast();

  const { appDetail, onSaveApp, currentTab } = useContextSelector(AppContext, (v) => v);
  const isV2Workflow = appDetail?.version === 'v2';
  const {
    isOpen: isOpenBackConfirm,
    onOpen: onOpenBackConfirm,
    onClose: onCloseBackConfirm
  } = useDisclosure();
  const {
    isOpen: isSaveAndPublishModalOpen,
    onOpen: onSaveAndPublishModalOpen,
    onClose: onSaveAndPublishModalClose
  } = useDisclosure();
  const [isSave, setIsSave] = useState(false);

  const {
    flowData2StoreData,
    flowData2StoreDataAndCheck,
    setWorkflowTestData,
    setHistoriesDefaultData,
    historiesDefaultData,
    nodes,
    edges,
    past,
    future,
    setPast
  } = useContextSelector(WorkflowContext, (v) => v);

  const isPublished = useMemo(() => {
    /* 
      Find the last saved snapshot in the past and future snapshots
    */
    const savedSnapshot =
      future.findLast((snapshot) => snapshot.isSaved) || past.find((snapshot) => snapshot.isSaved);

    return compareSnapshot(
      {
        nodes: savedSnapshot?.nodes,
        edges: savedSnapshot?.edges,
        chatConfig: savedSnapshot?.chatConfig
      },
      {
        nodes: nodes,
        edges: edges,
        chatConfig: appDetail.chatConfig
      }
    );
  }, [future, past, nodes, edges, appDetail.chatConfig]);

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
    try {
      localStorage.removeItem(`${appDetail._id}-past`);
      localStorage.removeItem(`${appDetail._id}-future`);
      router.push({
        pathname: '/app/list',
        query: {
          parentId: appDetail.parentId
        }
      });
    } catch (error) {}
  }, [appDetail._id, appDetail.parentId, router]);

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
          py={3}
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
          <MyIcon
            name={'common/leftArrowLight'}
            w={'1.75rem'}
            cursor={'pointer'}
            onClick={isPublished ? onBack : onOpenBackConfirm}
          />

          {/* app info */}
          <Box ml={1}>
            <AppCard isPublished={isPublished} showSaveStatus={isV2Workflow} />
          </Box>

          {isPc && (
            <Box position={'absolute'} left={'50%'} transform={'translateX(-50%)'}>
              <RouteTab />
            </Box>
          )}
          <Box flex={1} />

          {currentTab === TabEnum.appEdit && (
            <HStack flexDirection={['column', 'row']} spacing={[2, 3]}>
              {!historiesDefaultData && (
                <IconButton
                  icon={<MyIcon name={'history'} w={'18px'} />}
                  aria-label={''}
                  size={'sm'}
                  w={'30px'}
                  variant={'whitePrimary'}
                  onClick={async () => {
                    const { nodes, edges } = uiWorkflow2StoreWorkflow(await getWorkflowStore());

                    setHistoriesDefaultData({
                      nodes,
                      edges,
                      chatConfig: appDetail.chatConfig
                    });
                  }}
                />
              )}
              <Button
                size={'sm'}
                leftIcon={<MyIcon name={'core/workflow/debug'} w={['14px', '16px']} />}
                variant={'whitePrimary'}
                onClick={async () => {
                  const data = flowData2StoreDataAndCheck();
                  if (data) {
                    setWorkflowTestData(data);
                  }
                }}
              >
                {t('common:core.workflow.Run')}
              </Button>
              {!historiesDefaultData && (
                <MyPopover
                  placement={'bottom-end'}
                  hasArrow={false}
                  offset={[2, 4]}
                  w={'116px'}
                  onOpenFunc={() => setIsSave(true)}
                  onCloseFunc={() => setIsSave(false)}
                  trigger={'hover'}
                  Trigger={
                    <Button
                      size={'sm'}
                      rightIcon={
                        <MyIcon
                          name={isSave ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
                          w={['14px', '16px']}
                        />
                      }
                    >
                      <Box>{t('common:common.Save')}</Box>
                    </Button>
                  }
                >
                  {({ onClose }) => (
                    <MyBox p={1.5}>
                      <MyBox
                        display={'flex'}
                        size={'md'}
                        px={1}
                        py={1.5}
                        rounded={'4px'}
                        _hover={{ color: 'primary.600', bg: 'rgba(17, 24, 36, 0.05)' }}
                        cursor={'pointer'}
                        isLoading={loading}
                        onClick={async () => {
                          await onClickSave({});
                          toast({
                            status: 'success',
                            title: t('app:saved_success')
                          });
                          onClose();
                          setIsSave(false);
                        }}
                      >
                        <MyIcon name={'core/workflow/upload'} w={'16px'} mr={2} />
                        <Box fontSize={'sm'}>{t('common:core.workflow.Save to cloud')}</Box>
                      </MyBox>
                      <Flex
                        px={1}
                        py={1.5}
                        rounded={'4px'}
                        _hover={{ color: 'primary.600', bg: 'rgba(17, 24, 36, 0.05)' }}
                        cursor={'pointer'}
                        onClick={() => {
                          const data = flowData2StoreDataAndCheck();
                          if (data) {
                            onSaveAndPublishModalOpen();
                          }
                          onClose();
                          setIsSave(false);
                        }}
                      >
                        <MyIcon name={'core/workflow/publish'} w={'16px'} mr={2} />
                        <Box fontSize={'sm'}>{t('common:core.workflow.Save and publish')}</Box>
                        {isSaveAndPublishModalOpen && (
                          <SaveAndPublishModal
                            isLoading={loading}
                            onClose={onSaveAndPublishModalClose}
                            onClickSave={onClickSave}
                          />
                        )}
                      </Flex>
                    </MyBox>
                  )}
                </MyPopover>
              )}
            </HStack>
          )}
        </Flex>
        {historiesDefaultData && isV2Workflow && currentTab === TabEnum.appEdit && (
          <PublishHistories
            onClose={() => {
              setHistoriesDefaultData(undefined);
            }}
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
                await onClickSave({});
                onCloseBackConfirm();
                onBack();
                toast({
                  status: 'success',
                  title: t('app:saved_success')
                });
              }}
            >
              {t('common:common.Save_and_exit')}
            </Button>
          </ModalFooter>
        </MyModal>
      </>
    );
  }, [
    isPc,
    currentTab,
    isPublished,
    onBack,
    isOpenBackConfirm,
    onOpenBackConfirm,
    onCloseBackConfirm,
    t,
    loading,
    isV2Workflow,
    historiesDefaultData,
    isSave,
    onClickSave,
    setHistoriesDefaultData,
    appDetail.chatConfig,
    flowData2StoreDataAndCheck,
    setWorkflowTestData,
    isSaveAndPublishModalOpen,
    onSaveAndPublishModalClose,
    toast,
    onSaveAndPublishModalOpen
  ]);

  return Render;
};

export default React.memo(Header);
