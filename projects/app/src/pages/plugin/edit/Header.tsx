import React from 'react';
import { Box, Flex, IconButton, useTheme, useDisclosure } from '@chakra-ui/react';
import { PluginItemSchema } from '@fastgpt/global/core/plugin/type';
import { useRequest } from '@/web/common/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import dynamic from 'next/dynamic';
import MyIcon from '@/components/Icon';
import MyTooltip from '@/components/MyTooltip';
import { flowNode2Modules, useFlowProviderStore } from '@/components/core/module/Flow/FlowProvider';
import { putUpdatePlugin } from '@/web/core/plugin/api';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleItemType } from '@fastgpt/global/core/module/type';

const ImportSettings = dynamic(() => import('@/components/core/module/Flow/ImportSettings'));
const PreviewPlugin = dynamic(() => import('./Preview'));

type Props = { plugin: PluginItemSchema; onClose: () => void };

const Header = ({ plugin, onClose }: Props) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();
  const { nodes, edges, onFixView } = useFlowProviderStore();
  const [previewModules, setPreviewModules] = React.useState<ModuleItemType[]>();

  const { mutate: onclickSave, isLoading } = useRequest({
    mutationFn: () => {
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
            return Promise.reject(t('module.Plugin input must connect'));
          }
        }
        if (
          item.flowType === FlowNodeTypeEnum.pluginOutput &&
          item.inputs.find((input) => !input.connected)
        ) {
          return Promise.reject(t('core.module.Plugin output must connect'));
        }

        if (
          item.inputs.find((input) => {
            if (!input.required || input.connected) return false;
            if (!input.value || input.value === '' || input.value?.length === 0) return true;
            return false;
          })
        ) {
          return Promise.reject(`【${item.name}】存在未填或未连接参数`);
        }
      }

      // plugin must have input
      const pluginInputModule = modules.find(
        (item) => item.flowType === FlowNodeTypeEnum.pluginInput
      );

      if (!pluginInputModule) {
        return Promise.reject(t('module.Plugin input is required'));
      }
      if (pluginInputModule.inputs.length < 1) {
        return Promise.reject(t('module.Plugin input is not value'));
      }

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
        <MyTooltip label={'返回'} offset={[10, 10]}>
          <IconButton
            size={'sm'}
            icon={<MyIcon name={'back'} w={'14px'} />}
            borderRadius={'md'}
            borderColor={'myGray.300'}
            variant={'base'}
            aria-label={''}
            onClick={() => {
              onClose();
              onFixView();
            }}
          />
        </MyTooltip>
        <Box ml={[3, 6]} fontSize={['md', '2xl']} flex={1}>
          {plugin.name}
        </Box>

        <MyTooltip label={t('app.Import Configs')}>
          <IconButton
            mr={[3, 6]}
            icon={<MyIcon name={'importLight'} w={['14px', '16px']} />}
            borderRadius={'lg'}
            variant={'base'}
            aria-label={'save'}
            onClick={onOpenImport}
          />
        </MyTooltip>
        <MyTooltip label={t('app.Export Configs')}>
          <IconButton
            mr={[3, 6]}
            icon={<MyIcon name={'export'} w={['14px', '16px']} />}
            borderRadius={'lg'}
            variant={'base'}
            aria-label={'save'}
            onClick={() =>
              copyData(
                JSON.stringify(flowNode2Modules({ nodes, edges }), null, 2),
                t('app.Export Config Successful')
              )
            }
          />
        </MyTooltip>
        <MyTooltip label={t('module.Preview Plugin')}>
          <IconButton
            mr={[3, 6]}
            icon={<MyIcon name={'core/module/previewLight'} w={['14px', '16px']} />}
            borderRadius={'lg'}
            aria-label={'save'}
            variant={'base'}
            onClick={() => {
              setPreviewModules(flowNode2Modules({ nodes, edges }));
            }}
          />
        </MyTooltip>
        <MyTooltip label={t('module.Save Config')}>
          <IconButton
            icon={<MyIcon name={'save'} w={['14px', '16px']} />}
            borderRadius={'lg'}
            isLoading={isLoading}
            aria-label={'save'}
            onClick={onclickSave}
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
