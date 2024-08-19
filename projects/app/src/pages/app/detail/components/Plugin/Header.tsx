import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Flex,
  Button,
  IconButton,
  HStack,
  Input,
  ModalBody,
  ModalFooter,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';

import MyIcon from '@fastgpt/web/components/common/Icon';
import { useBeforeunload } from '@fastgpt/web/hooks/useBeforeunload';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext, getWorkflowStore } from '../WorkflowComponents/context';
import { useInterval } from 'ahooks';
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
import { useForm } from 'react-hook-form';
import { compareWorkflow } from '@/web/core/workflow/utils';

const PublishHistories = dynamic(() => import('../PublishHistoriesSlider'));

type FormType = {
  versionName: string;
  isPublish: boolean | undefined;
};

const Header = () => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const router = useRouter();

  const { appDetail, onPublish, appLatestVersion, currentTab } = useContextSelector(
    AppContext,
    (v) => v
  );
  const isV2Workflow = appDetail?.version === 'v2';
  const { register, setValue, watch, handleSubmit, reset } = useForm<FormType>({
    defaultValues: {
      versionName: '',
      isPublish: undefined
    }
  });
  const isPublish = watch('isPublish');
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [isSave, setIsSave] = useState(false);

  const {
    flowData2StoreDataAndCheck,
    setWorkflowTestData,
    onSaveWorkflow,
    setHistoriesDefaultData,
    historiesDefaultData,
    initData
  } = useContextSelector(WorkflowContext, (v) => v);

  const { runAsync: onClickSave, loading } = useRequest2(
    useCallback(
      async ({ isPublish, versionName }: { isPublish: boolean; versionName: string }) => {
        const data = flowData2StoreDataAndCheck();
        if (data) {
          await onPublish({
            ...data,
            isPublish,
            versionName,
            chatConfig: appDetail.chatConfig,
            //@ts-ignore
            version: 'v2'
          });
        }
      },
      [flowData2StoreDataAndCheck, onPublish, appDetail.chatConfig]
    )
  );

  const back = useCallback(async () => {
    try {
      router.push('/app/list');
    } catch (error) {}
  }, [onSaveWorkflow, router]);

  // effect
  useBeforeunload({
    callback: onSaveWorkflow,
    tip: t('common:core.common.tip.leave page')
  });
  useInterval(() => {
    if (!appDetail._id) return;
    onSaveWorkflow();
  }, 40000);

  const isPublished = (() => {
    const data = flowData2StoreDataAndCheck(true);
    if (!appLatestVersion) return true;

    if (data) {
      return compareWorkflow(
        {
          nodes: appLatestVersion.nodes,
          edges: appLatestVersion.edges,
          chatConfig: appLatestVersion.chatConfig
        },
        {
          nodes: data.nodes,
          edges: data.edges,
          chatConfig: appDetail.chatConfig
        }
      );
    }
    return false;
  })();

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
            onClick={isPublished ? () => back() : () => onOpen()}
          />
          <MyModal
            isOpen={isOpen}
            onClose={onClose}
            isLoading={loading}
            iconSrc="common/warn"
            title={t('common:common.Exit')}
            w={'400px'}
          >
            <ModalBody>
              <Box>{t('workflow:workflow.exit_tips')}</Box>
            </ModalBody>
            <ModalFooter display={'flex'} justifyContent={'space-between'}>
              <Button variant={'whiteDanger'} onClick={() => back()}>
                {t('common:common.Exit')}
              </Button>
              <Button variant={'whiteBase'} onClick={onClose}>
                {t('common:common.Cancel')}
              </Button>
              <Button
                onClick={async () => {
                  await onClickSave({
                    isPublish: false,
                    versionName: ''
                  });
                  back();
                }}
              >
                {t('common:common.Save_and_exit')}
              </Button>
            </ModalFooter>
          </MyModal>
          {/* app info */}
          <Box ml={1}>
            <AppCard
              isPublished={isPublished}
              showSaveStatus={
                !historiesDefaultData && isV2Workflow && currentTab === TabEnum.appEdit
              }
            />
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
                  {({}) => (
                    <MyBox p={1.5}>
                      <Flex
                        px={1}
                        py={1.5}
                        rounded={'4px'}
                        _hover={{ color: 'primary.600', bg: 'rgba(17, 24, 36, 0.05)' }}
                        cursor={'pointer'}
                        onClick={() => setValue('isPublish', false)}
                      >
                        <MyIcon name={'core/workflow/upload'} w={'16px'} mr={2} />
                        <Box fontSize={'sm'}>{t('common:core.workflow.Save to cloud')}</Box>
                        {!isPublish && isPublish !== undefined && (
                          <MyModal
                            title={t('common:core.workflow.Save to cloud')}
                            iconSrc={'core/workflow/upload'}
                            maxW={'400px'}
                            isOpen
                            onClose={() => reset()}
                            isLoading={loading}
                          >
                            <ModalBody>
                              <Box
                                mb={2.5}
                                color={'myGray.900'}
                                fontSize={'14px'}
                                fontWeight={'500'}
                              >
                                {t('common:common.Name')}
                              </Box>
                              <Box mb={3}>
                                <Input
                                  autoFocus
                                  placeholder={t('app:app.Version name')}
                                  bg={'myWhite.600'}
                                  {...register('versionName', {
                                    required: t('app:app.version_name_tips')
                                  })}
                                />
                              </Box>
                              <Box fontSize={'14px'}>{t('app:app.version_save_tips')}</Box>
                            </ModalBody>
                            <ModalFooter gap={3}>
                              <Button
                                onClick={() => {
                                  reset();
                                }}
                                variant={'whiteBase'}
                              >
                                {t('common:common.Cancel')}
                              </Button>
                              <Button
                                onClick={handleSubmit(async (data) => {
                                  await onClickSave({ ...data, isPublish });
                                  reset();
                                })}
                              >
                                {t('common:common.Confirm')}
                              </Button>
                            </ModalFooter>
                          </MyModal>
                        )}
                      </Flex>
                      <Flex
                        px={1}
                        py={1.5}
                        rounded={'4px'}
                        _hover={{ color: 'primary.600', bg: 'rgba(17, 24, 36, 0.05)' }}
                        cursor={'pointer'}
                        onClick={() => setValue('isPublish', true)}
                      >
                        <MyIcon name={'core/workflow/publish'} w={'16px'} mr={2} />
                        <Box fontSize={'sm'}>{t('common:core.workflow.Save and publish')}</Box>
                        {isPublish && (
                          <MyModal
                            title={t('common:core.workflow.Save and publish')}
                            iconSrc={'core/workflow/publish'}
                            maxW={'400px'}
                            isOpen
                            onClose={() => reset()}
                            isLoading={loading}
                          >
                            <ModalBody>
                              <Box
                                mb={2.5}
                                color={'myGray.900'}
                                fontSize={'14px'}
                                fontWeight={'500'}
                              >
                                {t('common:common.Name')}
                              </Box>
                              <Box mb={3}>
                                <Input
                                  autoFocus
                                  placeholder={t('app:app.Version name')}
                                  bg={'myWhite.600'}
                                  {...register('versionName', {
                                    required: t('app:app.version_name_tips')
                                  })}
                                />
                              </Box>
                              <Box fontSize={'14px'}>{t('app:app.version_publish_tips')}</Box>
                            </ModalBody>
                            <ModalFooter gap={3}>
                              <Button onClick={() => reset()} variant={'whiteBase'}>
                                {t('common:common.Cancel')}
                              </Button>
                              <Button
                                onClick={handleSubmit(async (data) => {
                                  await onClickSave({ ...data, isPublish });
                                  reset();
                                })}
                              >
                                {t('common:common.Confirm')}
                              </Button>
                            </ModalFooter>
                          </MyModal>
                        )}
                      </Flex>
                    </MyBox>
                  )}
                </MyPopover>
              )}
            </HStack>
          )}
        </Flex>
        {historiesDefaultData && (
          <PublishHistories
            initData={initData}
            onClose={() => {
              setHistoriesDefaultData(undefined);
            }}
            defaultData={historiesDefaultData}
          />
        )}
      </>
    );
  }, [
    isPc,
    currentTab,
    back,
    historiesDefaultData,
    isV2Workflow,
    t,
    initData,
    setHistoriesDefaultData,
    appDetail.chatConfig,
    flowData2StoreDataAndCheck,
    setWorkflowTestData,
    isPublish,
    isPublished,
    isOpen,
    onClickSave,
    loading,
    isSave
  ]);

  return Render;
};

export default React.memo(Header);
