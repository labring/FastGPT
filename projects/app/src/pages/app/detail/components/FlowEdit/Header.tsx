import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Box, Flex, IconButton, useTheme, useDisclosure, Button } from '@chakra-ui/react';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import { AppSchema } from '@fastgpt/global/core/app/type.d';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import dynamic from 'next/dynamic';

import MyIcon from '@fastgpt/web/components/common/Icon';
import ChatTest, { type ChatTestComponentRef } from '@/components/core/workflow/Flow/ChatTest';
import { flowNode2StoreNodes } from '@/components/core/workflow/utils';
import { useAppStore } from '@/web/core/app/store/useAppStore';
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
import { useQuery } from '@tanstack/react-query';
import { formatTime2HM } from '@fastgpt/global/common/string/time';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext, getWorkflowStore } from '@/components/core/workflow/context';

const ImportSettings = dynamic(() => import('@/components/core/workflow/Flow/ImportSettings'));

type Props = { app: AppSchema; onClose: () => void };

const RenderHeaderContainer = React.memo(function RenderHeaderContainer({
  app,
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
  const theme = useTheme();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { openConfirm: openConfigPublish, ConfirmModal } = useConfirm({
    content: t('core.app.Publish Confirm')
  });
  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();
  const { publishApp, updateAppDetail } = useAppStore();
  const edges = useContextSelector(WorkflowContext, (v) => v.edges);

  const [isSaving, setIsSaving] = useState(false);
  const [saveLabel, setSaveLabel] = useState(t('core.app.Onclick to save'));
  const onUpdateNodeError = useContextSelector(WorkflowContext, (v) => v.onUpdateNodeError);

  const flowData2StoreDataAndCheck = useCallback(async () => {
    const { nodes } = await getWorkflowStore();
    const checkResults = checkWorkflowNodeAndConnection({ nodes, edges });

    if (!checkResults) {
      const storeNodes = flowNode2StoreNodes({ nodes, edges });

      return storeNodes;
    } else {
      checkResults.forEach((nodeId) => onUpdateNodeError(nodeId, true));
      toast({
        status: 'warning',
        title: t('core.workflow.Check Failed')
      });
    }
  }, [edges, onUpdateNodeError, t, toast]);

  const onclickSave = useCallback(async () => {
    const { nodes } = await getWorkflowStore();

    if (nodes.length === 0) return null;
    setIsSaving(true);

    const storeWorkflow = flowNode2StoreNodes({ nodes, edges });

    try {
      await updateAppDetail(app._id, {
        ...storeWorkflow,
        type: AppTypeEnum.advanced,
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
  }, [updateAppDetail, app._id, edges, t]);

  const onclickPublish = useCallback(async () => {
    setIsSaving(true);
    const data = await flowData2StoreDataAndCheck();
    if (data) {
      try {
        await publishApp(app._id, {
          ...data,
          type: AppTypeEnum.advanced,
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
  }, [flowData2StoreDataAndCheck, publishApp, app._id, toast, t, ChatTestRef]);

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
            edges: data.edges
          },
          null,
          2
        ),
        t('app.Export Config Successful')
      );
    }
  }, [copyData, flowData2StoreDataAndCheck, t]);

  useBeforeunload({
    callback: onclickSave,
    tip: t('core.common.tip.leave page')
  });

  useQuery(['autoSave'], onclickSave, {
    refetchInterval: 20 * 1000,
    enabled: !!app._id
  });

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
          <Box ml={[3, 5]}>
            <Box fontSize={['md', 'lg']} fontWeight={'bold'}>
              {app.name}
            </Box>
            <MyTooltip label={t('core.app.Onclick to save')}>
              <Box
                fontSize={'sm'}
                mt={1}
                display={'inline-block'}
                borderRadius={'xs'}
                cursor={'pointer'}
                onClick={onclickSave}
                color={'myGray.500'}
              >
                {saveLabel}
              </Box>
            </MyTooltip>
          </Box>

          <Box flex={1} />

          <MyMenu
            Button={
              <IconButton
                mr={[3, 5]}
                icon={<MyIcon name={'more'} w={'14px'} p={2} />}
                aria-label={''}
                size={'sm'}
                variant={'whitePrimary'}
              />
            }
            menuList={[
              {
                label: t('app.Import Configs'),
                icon: 'common/importLight',
                onClick: onOpenImport
              },
              {
                label: t('app.Export Configs'),
                icon: 'export',
                onClick: onExportWorkflow
              }
            ]}
          />

          <Button
            mr={[3, 5]}
            size={'sm'}
            leftIcon={<MyIcon name={'core/chat/chatLight'} w={['14px', '16px']} />}
            variant={'whitePrimary'}
            onClick={async () => {
              const data = await flowData2StoreDataAndCheck();
              if (data) {
                setWorkflowTestData(data);
              }
            }}
          >
            {t('core.Chat test')}
          </Button>

          <Button
            size={'sm'}
            isLoading={isSaving}
            leftIcon={<MyIcon name={'common/publishFill'} w={['14px', '16px']} />}
            onClick={openConfigPublish(onclickPublish)}
          >
            {t('core.app.Publish')}
          </Button>
        </Flex>
        <ConfirmModal confirmText={t('core.app.Publish')} />
      </>
    );
  }, [
    ConfirmModal,
    app.name,
    flowData2StoreDataAndCheck,
    isSaving,
    onExportWorkflow,
    onOpenImport,
    onclickPublish,
    onclickSave,
    openConfigPublish,
    saveAndBack,
    saveLabel,
    setWorkflowTestData,
    t,
    theme.borders.base
  ]);

  return (
    <>
      {Render}
      {isOpenImport && <ImportSettings onClose={onCloseImport} />}
    </>
  );
});

const Header = (props: Props) => {
  const { app } = props;
  const ChatTestRef = useRef<ChatTestComponentRef>(null);

  const [workflowTestData, setWorkflowTestData] = useState<{
    nodes: StoreNodeItemType[];
    edges: StoreEdgeItemType[];
  }>();

  return (
    <>
      <RenderHeaderContainer
        {...props}
        ChatTestRef={ChatTestRef}
        setWorkflowTestData={setWorkflowTestData}
      />
      <ChatTest
        ref={ChatTestRef}
        {...workflowTestData}
        app={app}
        onClose={() => setWorkflowTestData(undefined)}
      />
    </>
  );
};

export default React.memo(Header);
