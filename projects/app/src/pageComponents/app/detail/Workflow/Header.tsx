import React, { useCallback, useMemo, useState } from 'react';
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
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useDebounceEffect, useKeyPress } from 'ahooks';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyBox from '@fastgpt/web/components/common/MyBox';

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
  const findNode = useContextSelector(WorkflowContext, (v) => v.findNode);

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
      pathname: '/dashboard/apps',
      query: {
        parentId: appDetail.parentId,
        type: lastAppListRouteType
      }
    });
  }, [appDetail.parentId, lastAppListRouteType, leaveSaveSign, router]);

  const [keyword, setKeyword] = useState<string | null>(null);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searchedNodeCount, setSearchedNodeCount] = useState(0);
  const isMac = !window ? false : window.navigator.userAgent.toLocaleLowerCase().includes('mac');
  useKeyPress(['ctrl.f', 'meta.f'], (e) => {
    e.preventDefault();
    e.stopPropagation();
    setKeyword('');
  });
  useDebounceEffect(
    () => {
      if (!!keyword) {
        const count = findNode({ keyword, index: searchIndex, t });
        setSearchedNodeCount(count);
      }
    },
    [keyword, searchIndex],
    {
      wait: 500
    }
  );
  const clearSearch = useCallback(() => {
    setKeyword(null);
    setSearchIndex(0);
    setSearchedNodeCount(0);
  }, []);

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
              {keyword === null ? (
                <MyTooltip label={isMac ? t('common:find_tip_mac') : t('common:find_tip')}>
                  <IconButton
                    icon={<MyIcon name={'common/searchLight'} w={'18px'} />}
                    aria-label={''}
                    size={'sm'}
                    w={'30px'}
                    variant={'whitePrimary'}
                    onClick={() => {
                      setKeyword('');
                    }}
                  />
                </MyTooltip>
              ) : (
                <MyBox position={'relative'}>
                  <SearchInput
                    w={'200px'}
                    pr={6}
                    value={keyword}
                    placeholder={t('workflow:please_enter_node_name')}
                    autoFocus={true}
                    onBlur={() => {
                      if (keyword) return;

                      clearSearch();
                    }}
                    onChange={(e) => {
                      setKeyword(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        if (searchIndex === searchedNodeCount - 1) {
                          setSearchIndex(0);
                        } else {
                          setSearchIndex(searchIndex + 1);
                        }
                      }
                    }}
                  />

                  {!!keyword && (
                    <>
                      <Flex
                        position={'absolute'}
                        top={1.5}
                        left={'176px'}
                        w={'18px'}
                        h={'18px'}
                        borderRadius={'sm'}
                        _hover={{ bg: 'myGray.50' }}
                        alignItems={'center'}
                        justifyContent={'center'}
                        cursor={'pointer'}
                        onClick={clearSearch}
                      >
                        <MyIcon name={'common/closeLight'} w={'14px'} />
                      </Flex>
                      <MyBox
                        position={'absolute'}
                        top={'34px'}
                        left={0}
                        w={'200px'}
                        h={'40px'}
                        zIndex={10}
                        bg={'white'}
                        rounded={'md'}
                        boxShadow={
                          '0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10)'
                        }
                        px={1.5}
                      >
                        <Flex px={1} alignItems={'center'} h={'full'}>
                          {searchedNodeCount > 0 ? (
                            <Flex alignItems={'center'} w={'full'} justifyContent={'space-between'}>
                              <Box fontSize={'12px'} color={'myGray.600'}>
                                {`${searchIndex + 1} / ${searchedNodeCount}`}
                              </Box>
                              <Flex>
                                <Button
                                  size={'xs'}
                                  fontSize={'12px'}
                                  variant={'ghost'}
                                  isDisabled={searchIndex === 0}
                                  onClick={() => {
                                    if (searchIndex === 0) return;
                                    setSearchIndex(searchIndex - 1);
                                  }}
                                >
                                  {t('workflow:previous')}
                                </Button>
                                <Button
                                  size={'xs'}
                                  fontSize={'12px'}
                                  variant={'ghost'}
                                  isDisabled={searchIndex === searchedNodeCount - 1}
                                  onClick={() => {
                                    if (searchIndex === searchedNodeCount - 1) return;
                                    setSearchIndex(searchIndex + 1);
                                  }}
                                >
                                  {t('workflow:next')}
                                </Button>
                              </Flex>
                            </Flex>
                          ) : (
                            <Flex fontSize={'xs'} color={'myGray.600'}>
                              {t('workflow:no_node_found')}
                            </Flex>
                          )}
                        </Flex>
                      </MyBox>
                    </>
                  )}
                </MyBox>
              )}
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
                flexShrink={0}
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
                  checkData={() => !!flowData2StoreDataAndCheck()}
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
    keyword,
    isMac,
    t,
    clearSearch,
    searchedNodeCount,
    searchIndex,
    showHistoryModal,
    loading,
    onClickSave,
    setShowHistoryModal,
    flowData2StoreDataAndCheck,
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
              } catch (error) {}
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
