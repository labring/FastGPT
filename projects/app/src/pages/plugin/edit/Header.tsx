import React, { useCallback, useMemo } from 'react';
import { Box, Flex, IconButton, useTheme, useDisclosure, Button } from '@chakra-ui/react';
import { PluginItemSchema } from '@fastgpt/global/core/plugin/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import dynamic from 'next/dynamic';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { uiWorkflow2StoreWorkflow } from '@/components/core/workflow/utils';
import { putUpdatePlugin } from '@/web/core/plugin/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import {
  checkWorkflowNodeAndConnection,
  filterSensitiveNodesData
} from '@/web/core/workflow/utils';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext, getWorkflowStore } from '@/components/core/workflow/context';
import { useI18n } from '@/web/context/I18n';

const ImportSettings = dynamic(() => import('@/components/core/workflow/Flow/ImportSettings'));

type Props = { plugin: PluginItemSchema; onClose: () => void };

const Header = ({ plugin, onClose }: Props) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { appT } = useI18n();

  const { toast } = useToast();
  const { copyData } = useCopyData();
  const edges = useContextSelector(WorkflowContext, (v) => v.edges);
  const onUpdateNodeError = useContextSelector(WorkflowContext, (v) => v.onUpdateNodeError);
  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();

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

  const { mutate: onclickSave, isLoading } = useRequest({
    mutationFn: async () => {
      const workflow = await flowData2StoreDataAndCheck();
      if (workflow) {
        await putUpdatePlugin({
          id: plugin._id,
          modules: workflow.nodes,
          edges: workflow.edges
        });
        toast({
          status: 'success',
          title: t('common.Save Success')
        });
      }
    }
  });

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
        appT('Export Config Successful')
      );
    }
  }, [appT, copyData, flowData2StoreDataAndCheck]);

  const Render = useMemo(() => {
    return (
      <>
        <Flex
          py={3}
          px={[2, 5, 8]}
          borderBottom={theme.borders.base}
          alignItems={'center'}
          userSelect={'none'}
        >
          <MyTooltip label={t('common.Back')} offset={[10, 10]}>
            <IconButton
              size={'smSquare'}
              icon={<MyIcon name={'common/backLight'} w={'14px'} />}
              variant={'whiteBase'}
              aria-label={''}
              onClick={() => {
                onClose();
              }}
            />
          </MyTooltip>
          <Box ml={[3, 5]} fontSize={['md', 'lg']} flex={1}>
            {plugin.name}
          </Box>

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
          <Button
            size={'sm'}
            isLoading={isLoading}
            leftIcon={<MyIcon name={'common/saveFill'} w={['14px', '16px']} />}
            onClick={onclickSave}
          >
            {t('common.Save')}
          </Button>
        </Flex>
        {isOpenImport && <ImportSettings onClose={onCloseImport} />}
      </>
    );
  }, [
    appT,
    isLoading,
    isOpenImport,
    onClose,
    onCloseImport,
    onExportWorkflow,
    onOpenImport,
    onclickSave,
    plugin.name,
    t,
    theme.borders.base
  ]);

  return Render;
};

export default React.memo(Header);
