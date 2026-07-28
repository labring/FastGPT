import React, { useRef, useState } from 'react';
import { Box, Flex, IconButton, Text, useBreakpointValue } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { useReactFlow } from 'reactflow';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { removeUnauthModels } from '@fastgpt/global/core/workflow/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { parseWorkflowImportConfig } from '@/pageComponents/dashboard/agent/utils/appTemplateParse';
import { AppContext } from '../../context';
import { WorkflowUtilsContext } from '../context/workflowUtilsContext';
import {
  compileStoreWorkflow,
  getWorkflowChecksum,
  parseCompatibleWorkflowDocument
} from '@fastgpt/workflow-core';
import type { WorkflowBuilderApplied } from '@fastgpt/global/openapi/core/workflow/builder/api';
import ChatPanel, { type WorkflowBuilderChatPanelRef } from './ChatPanel';
import { requestWorkflowAutoLayout } from '../Flow/utils/workflowAutoLayout';

const WorkflowBuilder = () => {
  const { t } = useTranslation('workflow');
  const { toast } = useToast();
  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete',
    title: t('workflow_builder_clear_history'),
    content: t('workflow_builder_clear_history_confirm')
  });
  const { fitView, getNodes } = useReactFlow();
  const feConfigs = useSystemStore((state) => state.feConfigs);
  const getMyModelList = useSystemStore((state) => state.getMyModelList);
  const appId = useContextSelector(AppContext, (value) => value.appId);
  const appDetail = useContextSelector(AppContext, (value) => value.appDetail);
  const setAppDetail = useContextSelector(AppContext, (value) => value.setAppDetail);
  const initData = useContextSelector(WorkflowUtilsContext, (value) => value.initData);
  const [isOpen, setIsOpen] = useState(false);
  const chatPanelRef = useRef<WorkflowBuilderChatPanelRef>(null);
  const panelWidth = useBreakpointValue({ base: '100%', md: '420px' }) || '420px';

  const enabled =
    !!feConfigs?.isPlus &&
    !!feConfigs.show_agent_sandbox &&
    feConfigs.show_workflow_builder !== false &&
    !!appDetail.permission?.hasWritePer;
  if (!enabled) return null;

  /** 将服务端 CLI Apply 后的目标文档导入当前画布，并复用画布统一布局能力。 */
  const onWorkflowApplied = async (result: WorkflowBuilderApplied) => {
    try {
      const targetDocument = parseCompatibleWorkflowDocument(result.document);
      if ((await getWorkflowChecksum(targetDocument)) !== result.checksum) {
        throw new Error('Workflow Builder apply response checksum mismatch');
      }
      const workflowConfig = parseWorkflowImportConfig({
        config: compileStoreWorkflow(targetDocument),
        appType:
          appDetail.type === AppTypeEnum.workflowTool
            ? AppTypeEnum.workflowTool
            : AppTypeEnum.workflow,
        t
      });
      await removeUnauthModels({
        modules: workflowConfig.nodes,
        allowedModels: await getMyModelList()
      });
      await initData(workflowConfig);
      setAppDetail((current) => ({
        ...current,
        name: targetDocument.app?.name ?? current.name,
        intro: targetDocument.app?.intro ?? current.intro
      }));

      let nodeDimensionsReady = false;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        const nodes = getNodes();
        nodeDimensionsReady = nodes.length > 0 && nodes.every((node) => node.width && node.height);
        if (nodeDimensionsReady) break;
      }
      if (!nodeDimensionsReady || !requestWorkflowAutoLayout()) {
        fitView({ padding: 0.25 });
      }
      toast({ status: 'success', title: t('workflow_builder_applied') });
    } catch (error) {
      const errorText =
        error instanceof Error
          ? error.message
          : JSON.stringify(error ?? 'Workflow Builder apply failed');
      toast({
        status: 'warning',
        title: t('workflow_builder_apply_failed'),
        description: errorText
      });
    }
  };

  if (!isOpen) {
    return (
      <MyTooltip label={t('workflow_builder_title')}>
        <IconButton
          aria-label={t('workflow_builder_title')}
          icon={<MyIcon name={'codeCopilot'} w={'20px'} />}
          position={'absolute'}
          top={'84px'}
          right={'20px'}
          zIndex={6}
          w={'40px'}
          h={'40px'}
          bg={'white'}
          color={'primary.600'}
          borderWidth={'1px'}
          borderColor={'myGray.200'}
          borderRadius={'6px'}
          boxShadow={'0 4px 12px rgba(16, 24, 40, 0.12)'}
          _hover={{ bg: 'myGray.50' }}
          onClick={() => setIsOpen(true)}
        />
      </MyTooltip>
    );
  }

  return (
    <Box
      position={'absolute'}
      top={'72px'}
      right={0}
      bottom={[0, 4]}
      zIndex={7}
      w={panelWidth}
      minW={0}
      bg={'white'}
      borderLeftWidth={'1px'}
      borderColor={'myGray.200'}
      boxShadow={'-8px 0 24px rgba(16, 24, 40, 0.08)'}
    >
      <Flex
        h={'52px'}
        px={4}
        alignItems={'center'}
        borderBottomWidth={'1px'}
        borderColor={'myGray.200'}
      >
        <MyIcon name={'codeCopilot'} w={'18px'} color={'primary.600'} />
        <Text ml={2} flex={1} fontSize={'sm'} fontWeight={600} color={'myGray.900'}>
          {t('workflow_builder_title')}
        </Text>
        <MyTooltip label={t('workflow_builder_clear_history')}>
          <IconButton
            aria-label={t('workflow_builder_clear_history')}
            icon={<MyIcon name={'delete'} w={'17px'} />}
            variant={'ghost'}
            size={'sm'}
            color={'myGray.600'}
            onClick={() =>
              openConfirm({
                onConfirm: () => chatPanelRef.current?.clearHistory()
              })()
            }
          />
        </MyTooltip>
        <MyTooltip label={t('workflow_builder_collapse')}>
          <IconButton
            aria-label={t('workflow_builder_collapse')}
            icon={<MyIcon name={'core/chat/sidebar/fold'} w={'18px'} />}
            variant={'ghost'}
            size={'sm'}
            onClick={() => setIsOpen(false)}
          />
        </MyTooltip>
      </Flex>
      <Box h={'calc(100% - 52px)'} minH={0}>
        <ChatPanel
          ref={chatPanelRef}
          appId={appId}
          appDetail={appDetail}
          onWorkflowApplied={onWorkflowApplied}
        />
      </Box>
      <ConfirmModal />
    </Box>
  );
};

export default React.memo(WorkflowBuilder);
