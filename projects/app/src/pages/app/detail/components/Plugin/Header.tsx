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
import { useForm } from 'react-hook-form';
import { isEqual, isObject, omit } from 'lodash';

const PublishHistories = dynamic(() => import('../WorkflowPublishHistoriesSlider'));

type FormType = {
  versionName: string;
  isPublish: boolean | undefined;
};

const Header = () => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const router = useRouter();

  const { appDetail, onPublish, currentTab } = useContextSelector(AppContext, (v) => v);
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
    flowData2StoreData,
    flowData2StoreDataAndCheck,
    setWorkflowTestData,
    setHistoriesDefaultData,
    historiesDefaultData,
    nodes,
    edges,
    savedSnapshot,
    setIsResetSavedSnapshot
  } = useContextSelector(WorkflowContext, (v) => v);

  const isPublished = useMemo(() => {
    // 自定义比较函数
    const customIsEqual = (obj1: Record<string, any>, obj2: Record<string, any>): boolean => {
      if (Array.isArray(obj1) && Array.isArray(obj2)) {
        if (obj1.length !== obj2.length) return false;
        return obj1.every((item, index) => customIsEqual(item, obj2[index]));
      }

      if (isObject(obj1) && isObject(obj2)) {
        const keys1 = Object.keys(obj1).filter((key) => key !== 'width' && key !== 'height');
        const keys2 = Object.keys(obj2).filter((key) => key !== 'width' && key !== 'height');

        if (keys1.length !== keys2.length) return false;

        return keys1.every((key) => customIsEqual(obj1[key], obj2[key]));
      }

      return isEqual(obj1, obj2);
    };

    return customIsEqual(
      {
        nodes: savedSnapshot.nodes,
        edges: savedSnapshot.edges,
        chatConfig: savedSnapshot.chatConfig
      },
      {
        nodes: nodes,
        edges: edges,
        chatConfig: appDetail.chatConfig
      }
    );
  }, [savedSnapshot, nodes, edges, appDetail.chatConfig]);

  const { runAsync: onClickSave, loading } = useRequest2(
    useCallback(
      async ({ isPublish, versionName }: { isPublish: boolean; versionName: string }) => {
        const data = flowData2StoreData();

        if (data) {
          await onPublish({
            ...data,
            isPublish,
            versionName,
            chatConfig: appDetail.chatConfig,
            //@ts-ignore
            version: 'v2'
          });
          setIsResetSavedSnapshot(true);
        }
      },
      [flowData2StoreData, onPublish, appDetail.chatConfig]
    )
  );

  const back = useCallback(async () => {
    try {
      localStorage.removeItem(`${appDetail._id}-past`);
      localStorage.removeItem(`${appDetail._id}-future`);
      localStorage.removeItem(`${appDetail._id}-initial`);
      localStorage.removeItem(`${appDetail._id}-saved`);
      router.push('/app/list');
    } catch (error) {}
  }, [router]);

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
            iconSrc="common/warn"
            title={t('common:common.Exit')}
            w={'400px'}
          >
            <ModalBody>
              <Box>{t('workflow:workflow.exit_tips')}</Box>
            </ModalBody>
            <ModalFooter gap={3}>
              <Button variant={'whiteDanger'} onClick={() => back()}>
                {t('common:common.Exit Directly')}
              </Button>
              <Button
                isLoading={loading}
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
              showSaveStatus={isV2Workflow && currentTab === TabEnum.appEdit}
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
                          await onClickSave({
                            isPublish: false,
                            versionName: ''
                          });
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
                            setValue('isPublish', true);
                          }
                        }}
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
                                isLoading={loading}
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
        {historiesDefaultData && isV2Workflow && currentTab === TabEnum.appEdit && (
          <PublishHistories
            onClose={() => {
              setHistoriesDefaultData(undefined);
            }}
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
