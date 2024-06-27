import React, { useCallback, useMemo } from 'react';
import { Box, Flex, Button, IconButton, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';

import MyIcon from '@fastgpt/web/components/common/Icon';
import { useBeforeunload } from '@fastgpt/web/hooks/useBeforeunload';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext, getWorkflowStore } from '../WorkflowComponents/context';
import { useInterval } from 'ahooks';
import { AppContext, TabEnum } from '../context';
import RouteTab from '../RouteTab';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { useRouter } from 'next/router';

import AppCard from '../WorkflowComponents/AppCard';
import { uiWorkflow2StoreWorkflow } from '../WorkflowComponents/utils';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
const PublishHistories = dynamic(() => import('../PublishHistoriesSlider'));

const Header = () => {
  const { t } = useTranslation();
  const { isPc } = useSystemStore();
  const router = useRouter();

  const { appDetail, onPublish, currentTab } = useContextSelector(AppContext, (v) => v);
  const isV2Workflow = appDetail?.version === 'v2';

  const {
    flowData2StoreDataAndCheck,
    setWorkflowTestData,
    onSaveWorkflow,
    setHistoriesDefaultData,
    historiesDefaultData,
    initData
  } = useContextSelector(WorkflowContext, (v) => v);

  const onclickPublish = useCallback(async () => {
    const data = flowData2StoreDataAndCheck();
    if (data) {
      await onPublish({
        ...data,
        chatConfig: appDetail.chatConfig,
        //@ts-ignore
        version: 'v2'
      });
    }
  }, [flowData2StoreDataAndCheck, onPublish, appDetail.chatConfig]);

  const saveAndBack = useCallback(async () => {
    try {
      await onSaveWorkflow();
      router.push('/app/list');
    } catch (error) {}
  }, [onSaveWorkflow, router]);

  // effect
  useBeforeunload({
    callback: onSaveWorkflow,
    tip: t('core.common.tip.leave page')
  });
  useInterval(() => {
    if (!appDetail._id) return;
    onSaveWorkflow();
  }, 40000);

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
            onClick={saveAndBack}
          />
          {/* app info */}
          <Box ml={1}>
            <AppCard
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
                {t('core.workflow.Debug')}
              </Button>

              {!historiesDefaultData && (
                <PopoverConfirm
                  showCancel
                  content={t('core.app.Publish Confirm')}
                  Trigger={
                    <Box>
                      <MyTooltip label={t('core.app.Publish app tip')}>
                        <Button
                          size={'sm'}
                          leftIcon={<MyIcon name={'common/publishFill'} w={['14px', '16px']} />}
                        >
                          {t('core.app.Publish')}
                        </Button>
                      </MyTooltip>
                    </Box>
                  }
                  onConfirm={() => onclickPublish()}
                />
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
    saveAndBack,
    historiesDefaultData,
    isV2Workflow,
    t,
    initData,
    setHistoriesDefaultData,
    appDetail.chatConfig,
    flowData2StoreDataAndCheck,
    setWorkflowTestData,
    onclickPublish
  ]);

  return Render;
};

export default React.memo(Header);
