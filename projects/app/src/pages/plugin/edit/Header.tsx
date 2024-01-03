import React, { useCallback } from 'react';
import { Box, Flex, IconButton, useTheme, useDisclosure } from '@chakra-ui/react';
import { PluginItemSchema } from '@fastgpt/global/core/plugin/type';
import { useRequest } from '@/web/common/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import dynamic from 'next/dynamic';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@/components/MyTooltip';
import { getFlowStore } from '@/components/core/module/Flow/FlowProvider';
import { filterExportModules, flowNode2Modules } from '@/components/core/module/utils';
import { putUpdatePlugin } from '@/web/core/plugin/api';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleItemType } from '@fastgpt/global/core/module/type';
import { useToast } from '@/web/common/hooks/useToast';

const ImportSettings = dynamic(() => import('@/components/core/module/Flow/ImportSettings'));
const PreviewPlugin = dynamic(() => import('./Preview'));

type Props = { plugin: PluginItemSchema; onClose: () => void };

const Header = ({ plugin, onClose }: Props) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { copyData } = useCopyData();
  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();
  const [previewModules, setPreviewModules] = React.useState<ModuleItemType[]>();

  const flow2ModulesAndCheck = useCallback(async () => {
    const { nodes, edges } = await getFlowStore();

    const modules = flowNode2Modules({ nodes, edges });

    // check required connect
    for (let i = 0; i < modules.length; i++) {
      const item = modules[i];

      // update custom input connected
      if (item.flowType === FlowNodeTypeEnum.pluginInput) {
        item.inputs.forEach((item) => {
          item.connected = true;
        });
        if (item.outputs.find((output) => output.targets.length === 0)) {
          toast({
            status: 'warning',
            title: t('module.Plugin input must connect')
          });
          return false;
        }
      }
      if (
        item.flowType === FlowNodeTypeEnum.pluginOutput &&
        item.inputs.find((input) => !input.connected)
      ) {
        toast({
          status: 'warning',
          title: t('core.module.Plugin output must connect')
        });
        return false;
      }

      if (
        item.inputs.find((input) => {
          if (!input.required || input.connected) return false;
          if (input.value === undefined || input.value === '' || input.value?.length === 0) {
            return true;
          }
          return false;
        })
      ) {
        toast({
          status: 'warning',
          title: `【${item.name}】存在未填或未连接参数`
        });
        return false;
      }
    }

    // plugin must have input
    const pluginInputModule = modules.find(
      (item) => item.flowType === FlowNodeTypeEnum.pluginInput
    );

    if (!pluginInputModule) {
      toast({
        status: 'warning',
        title: t('module.Plugin input is required')
      });
      return false;
    }
    if (pluginInputModule.inputs.length < 1) {
      toast({
        status: 'warning',
        title: t('module.Plugin input is not value')
      });
      return false;
    }

    return modules;
  }, [t, toast]);

  const { mutate: onclickSave, isLoading } = useRequest({
    mutationFn: (modules: ModuleItemType[]) => {
      return putUpdatePlugin({
        id: plugin._id,
        modules
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
        <Box ml={[3, 6]} fontSize={['md', '2xl']} flex={1}>
          {plugin.name}
        </Box>

        <MyTooltip label={t('app.Import Configs')}>
          <IconButton
            mr={[3, 6]}
            icon={<MyIcon name={'common/importLight'} w={['14px', '16px']} />}
            variant={'whitePrimary'}
            size={'smSquare'}
            aria-label={'save'}
            onClick={onOpenImport}
          />
        </MyTooltip>
        <MyTooltip label={t('app.Export Configs')}>
          <IconButton
            mr={[3, 6]}
            icon={<MyIcon name={'export'} w={['14px', '16px']} />}
            size={'smSquare'}
            variant={'whitePrimary'}
            aria-label={'save'}
            onClick={async () => {
              const modules = await flow2ModulesAndCheck();
              if (modules) {
                copyData(filterExportModules(modules), t('app.Export Config Successful'));
              }
            }}
          />
        </MyTooltip>
        <MyTooltip label={t('module.Preview Plugin')}>
          <IconButton
            mr={[3, 6]}
            icon={<MyIcon name={'core/modules/previewLight'} w={['14px', '16px']} />}
            size={'smSquare'}
            aria-label={'save'}
            variant={'whitePrimary'}
            onClick={async () => {
              const modules = await flow2ModulesAndCheck();
              if (modules) {
                setPreviewModules(modules);
              }
            }}
          />
        </MyTooltip>
        <MyTooltip label={t('module.Save Config')}>
          <IconButton
            icon={<MyIcon name={'save'} w={['14px', '16px']} />}
            size={'smSquare'}
            isLoading={isLoading}
            aria-label={'save'}
            onClick={async () => {
              const modules = await flow2ModulesAndCheck();
              if (modules) {
                onclickSave(modules);
              }
            }}
          />
        </MyTooltip>
      </Flex>
      {isOpenImport && <ImportSettings onClose={onCloseImport} />}
      {!!previewModules && (
        <PreviewPlugin
          plugin={plugin}
          modules={previewModules}
          onClose={() => setPreviewModules(undefined)}
        />
      )}
    </>
  );
};

export default React.memo(Header);
