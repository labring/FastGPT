import React, { useCallback } from 'react';
import { Box, Flex, IconButton, useTheme, useDisclosure, Button } from '@chakra-ui/react';
import { PluginItemSchema } from '@fastgpt/global/core/plugin/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import dynamic from 'next/dynamic';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@/components/MyTooltip';
import { filterExportModules, flowNode2StoreNodes } from '@/components/core/workflow/utils';
import { putUpdatePlugin } from '@/web/core/plugin/api';
import { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import {
  getWorkflowStore,
  useFlowProviderStore
} from '@/components/core/workflow/Flow/FlowProvider';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import {
  checkWorkflowNodeAndConnection,
  filterSensitiveNodesData
} from '@/web/core/workflow/utils';

const ImportSettings = dynamic(() => import('@/components/core/workflow/Flow/ImportSettings'));

type Props = { plugin: PluginItemSchema; onClose: () => void };

const Header = ({ plugin, onClose }: Props) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { copyData } = useCopyData();
  const { edges, onUpdateNodeError } = useFlowProviderStore();
  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();

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

  const { mutate: onclickSave, isLoading } = useRequest({
    mutationFn: ({ nodes, edges }: { nodes: StoreNodeItemType[]; edges: StoreEdgeItemType[] }) => {
      return putUpdatePlugin({
        id: plugin._id,
        modules: nodes,
        edges
      });
    },
    successToast: '保存配置成功',
    errorToast: '保存配置异常'
  });

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
        <Box ml={[3, 5]} fontSize={['md', '2xl']} flex={1}>
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
            { label: t('app.Import Configs'), icon: 'common/importLight', onClick: onOpenImport },
            {
              label: t('app.Export Configs'),
              icon: 'export',
              onClick: async () => {
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
              }
            }
          ]}
        />
        {/* <MyTooltip label={t('module.Preview Plugin')}>
          <IconButton
            mr={[3, 5]}
            icon={<MyIcon name={'core/modules/previewLight'} w={['14px', '16px']} />}
            size={'smSquare'}
            aria-label={'save'}
            variant={'whitePrimary'}
            onClick={async () => {
              const modules = await flowData2StoreDataAndCheck();
              if (modules) {
                setPreviewModules(modules);
              }
            }}
          />
        </MyTooltip> */}
        <Button
          size={'sm'}
          isLoading={isLoading}
          leftIcon={<MyIcon name={'common/saveFill'} w={['14px', '16px']} />}
          onClick={async () => {
            const modules = await flowData2StoreDataAndCheck();
            if (modules) {
              onclickSave(modules);
            }
          }}
        >
          {t('common.Save')}
        </Button>
      </Flex>
      {isOpenImport && <ImportSettings onClose={onCloseImport} />}
    </>
  );
};

export default React.memo(Header);
