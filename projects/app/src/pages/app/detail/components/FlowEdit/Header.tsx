import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, IconButton, useTheme, useDisclosure, Button } from '@chakra-ui/react';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import dynamic from 'next/dynamic';

import MyIcon from '@fastgpt/web/components/common/Icon';
import ChatTest, { type ChatTestComponentRef } from '@/components/core/workflow/Flow/ChatTest';
import { uiWorkflow2StoreWorkflow } from '@/components/core/workflow/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { getErrText } from '@fastgpt/global/common/error/utils';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import {
  checkWorkflowNodeAndConnection,
  filterSensitiveNodesData
} from '@/web/core/workflow/utils';
import { useBeforeunload } from '@fastgpt/web/hooks/useBeforeunload';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { formatTime2HM } from '@fastgpt/global/common/string/time';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext, getWorkflowStore } from '@/components/core/workflow/context';
import { useInterval, useUpdateEffect } from 'ahooks';
import { useI18n } from '@/web/context/I18n';
import { AppContext } from '@/web/core/app/context/appContext';

const ImportSettings = dynamic(() => import('@/components/core/workflow/Flow/ImportSettings'));
const PublishHistories = dynamic(
  () => import('@/components/core/workflow/components/PublishHistoriesSlider')
);

type Props = { onClose: () => void };

const RenderHeaderContainer = React.memo(function RenderHeaderContainer({
  ChatTestRef,
  setWorkflowTestData,
  onClose
}: Props & {
  ChatTestRef: React.RefObject<ChatTestComponentRef>;
  setWorkflowTestData: React.Dispatch<
    React.SetStateAction<
      | {
          nodes: StoreNodeItemType[];
          edges: StoreEdgeItemType[];
        }
      | undefined
    >
  >;
}) {
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const isV2Workflow = appDetail?.version === 'v2';

  const theme = useTheme();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { appT } = useI18n();

  const { copyData } = useCopyData();
  const { openConfirm: openConfigPublish, ConfirmModal } = useConfirm({
    content: t('core.app.Publish Confirm')
  });
  const { publishApp, updateAppDetail } = useContextSelector(AppContext, (v) => v);
  const edges = useContextSelector(WorkflowContext, (v) => v.edges);

  const [isSaving, setIsSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState(t('core.app.Onclick to save'));
  const onUpdateNodeError = useContextSelector(WorkflowContext, (v) => v.onUpdateNodeError);

  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();

  const isShowVersionHistories = useContextSelector(
    WorkflowContext,
    (v) => v.isShowVersionHistories
  );
  const setIsShowVersionHistories = useContextSelector(
    WorkflowContext,
    (v) => v.setIsShowVersionHistories
  );
  const workflowDebugData = useContextSelector(WorkflowContext, (v) => v.workflowDebugData);

  const flowData2StoreDataAndCheck = useCallback(async () => {
    const { nodes } = await getWorkflowStore();
    const checkResults = checkWorkflowNodeAndConnection({ nodes, edges });

    if (!checkResults) {
      const storeNodes = uiWorkflow2StoreWorkflow({ nodes, edges });

      return storeNodes;
    } else {
      checkResults.forEach((nodeId) => onUpdateNodeError(nodeId, true));
      toast({
        status: 'warning',
        title: t('core.workflow.Check Failed')
      });
    }
  }, [edges, onUpdateNodeError, t, toast]);

  const onclickSave = useCallback(
    async (forbid?: boolean) => {
      // version preview / debug mode, not save
      if (!isV2Workflow || isShowVersionHistories || forbid) return;

      const { nodes } = await getWorkflowStore();

      if (nodes.length === 0) return null;
      setIsSaving(true);

      const storeWorkflow = uiWorkflow2StoreWorkflow({ nodes, edges });

      try {
        await updateAppDetail({
          ...storeWorkflow,
          type: AppTypeEnum.advanced,
          chatConfig: appDetail.chatConfig,
          //@ts-ignore
          version: 'v2'
        });

        setSaveLabel(
          t('core.app.Auto Save time', {
            time: formatTime2HM()
          })
        );
        // ChatTestRef.current?.resetChatTest();
      } catch (error) {}

      setIsSaving(false);

      return null;
    },
    [isV2Workflow, isShowVersionHistories, edges, updateAppDetail, appDetail.chatConfig, t]
  );

  const onclickPublish = useCallback(async () => {
    setIsSaving(true);
    const data = await flowData2StoreDataAndCheck();
    if (data) {
      try {
        await publishApp({
          ...data,
          type: AppTypeEnum.advanced,
          chatConfig: appDetail.chatConfig,
          //@ts-ignore
          version: 'v2'
        });
        toast({
          status: 'success',
          title: t('core.app.Publish Success')
        });
        ChatTestRef.current?.resetChatTest();
      } catch (error) {
        toast({
          status: 'warning',
          title: getErrText(error, t('core.app.Publish Failed'))
        });
      }
    }

    setIsSaving(false);
  }, [flowData2StoreDataAndCheck, publishApp, appDetail.chatConfig, toast, t, ChatTestRef]);

  const saveAndBack = useCallback(async () => {
    try {
      await onclickSave();
      onClose();
    } catch (error) {}
  }, [onClose, onclickSave]);

  const onExportWorkflow = useCallback(async () => {
    const data = await flowData2StoreDataAndCheck();
    if (data) {
      copyData(
        JSON.stringify(
          {
            nodes: filterSensitiveNodesData(data.nodes),
            edges: data.edges,
            chatConfig: appDetail.chatConfig
          },
          null,
          2
        ),
        appT('Export Config Successful')
      );
    }
  }, [appDetail.chatConfig, appT, copyData, flowData2StoreDataAndCheck]);

  // effect
  useBeforeunload({
    callback: onclickSave,
    tip: t('core.common.tip.leave page')
  });

  useInterval(() => {
    if (!appDetail._id) return;
    onclickSave(!!workflowDebugData);
  }, 20000);

  const Render = useMemo(() => {
    return (
      <>
        <Flex
          py={3}
          px={[2, 5, 8]}
          borderBottom={theme.borders.base}
          alignItems={'center'}
          userSelect={'none'}
          bg={'myGray.25'}
          h={'67px'}
        >
          <IconButton
            size={'smSquare'}
            icon={<MyIcon name={'common/backFill'} w={'14px'} />}
            borderRadius={'50%'}
            w={'26px'}
            h={'26px'}
            borderColor={'myGray.300'}
            variant={'whiteBase'}
            aria-label={''}
            isLoading={isSaving}
            onClick={saveAndBack}
          />
          <Box ml={[2, 4]}>
            <Box fontSize={'md'} fontWeight={'bold'}>
              {appDetail.name}
            </Box>
            {!isShowVersionHistories && isV2Workflow && (
              <MyTooltip label={t('core.app.Onclick to save')}>
                <Box
                  fontSize={'xs'}
                  mt={1}
                  display={'inline-block'}
                  borderRadius={'xs'}
                  cursor={'pointer'}
                  onClick={() => onclickSave()}
                  color={'myGray.500'}
                >
                  {saveLabel}
                </Box>
              </MyTooltip>
            )}
          </Box>

          <Box flex={1} />

          {!isShowVersionHistories && (
            <>
              <MyMenu
                Button={
                  <IconButton
                    mr={[2, 4]}
                    icon={<MyIcon name={'more'} w={'14px'} p={2} />}
                    aria-label={''}
                    size={'sm'}
                    variant={'whitePrimary'}
                  />
                }
                menuList={[
                  {
                    children: [
                      {
                        label: appT('Import Configs'),
                        icon: 'common/importLight',
                        onClick: onOpenImport
                      },
                      {
                        label: appT('Export Configs'),
                        icon: 'export',
                        onClick: onExportWorkflow
                      }
                    ]
                  }
                ]}
              />

              <IconButton
                mr={[2, 4]}
                icon={<MyIcon name={'history'} w={'18px'} />}
                aria-label={''}
                size={'sm'}
                w={'30px'}
                variant={'whitePrimary'}
                onClick={() => setIsShowVersionHistories(true)}
              />
            </>
          )}

          <Button
            size={'sm'}
            leftIcon={<MyIcon name={'core/workflow/debug'} w={['14px', '16px']} />}
            variant={'whitePrimary'}
            onClick={async () => {
              const data = await flowData2StoreDataAndCheck();
              if (data) {
                setWorkflowTestData(data);
              }
            }}
          >
            {t('core.workflow.Debug')}
          </Button>

          {!isShowVersionHistories && (
            <Button
              ml={[2, 4]}
              size={'sm'}
              isLoading={isSaving}
              leftIcon={<MyIcon name={'common/publishFill'} w={['14px', '16px']} />}
              onClick={openConfigPublish(onclickPublish)}
            >
              {t('core.app.Publish')}
            </Button>
          )}
        </Flex>
        <ConfirmModal confirmText={t('core.app.Publish')} />
      </>
    );
  }, [
    theme.borders.base,
    isSaving,
    saveAndBack,
    appDetail.name,
    isShowVersionHistories,
    isV2Workflow,
    t,
    saveLabel,
    appT,
    onOpenImport,
    onExportWorkflow,
    openConfigPublish,
    onclickPublish,
    ConfirmModal,
    onclickSave,
    setIsShowVersionHistories,
    flowData2StoreDataAndCheck,
    setWorkflowTestData
  ]);

  return (
    <>
      {Render}
      {isOpenImport && <ImportSettings onClose={onCloseImport} />}
      {isShowVersionHistories && <PublishHistories />}
    </>
  );
});

const Header = (props: Props) => {
  const ChatTestRef = useRef<ChatTestComponentRef>(null);

  const [workflowTestData, setWorkflowTestData] = useState<{
    nodes: StoreNodeItemType[];
    edges: StoreEdgeItemType[];
  }>();
  const { isOpen: isOpenTest, onOpen: onOpenTest, onClose: onCloseTest } = useDisclosure();

  useUpdateEffect(() => {
    onOpenTest();
  }, [workflowTestData]);

  return (
    <>
      <RenderHeaderContainer
        {...props}
        ChatTestRef={ChatTestRef}
        setWorkflowTestData={setWorkflowTestData}
      />
      <ChatTest ref={ChatTestRef} isOpen={isOpenTest} {...workflowTestData} onClose={onCloseTest} />
    </>
  );
};

export default React.memo(Header);
