import React, { useCallback } from 'react';
import { Box, Flex, IconButton, useTheme, useDisclosure } from '@chakra-ui/react';
import { FlowModuleItemSchema } from '@fastgpt/global/core/module/type';
import { useRequest } from '@/web/common/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import dynamic from 'next/dynamic';

import MyIcon from '@/components/Icon';
import MyTooltip from '@/components/MyTooltip';
import { flowNode2Modules, useFlowProviderStore } from '@/components/core/module/Flow/FlowProvider';
import { putUpdateModule } from '@/web/core/module/api';

const ImportSettings = dynamic(() => import('@/components/core/module/Flow/ImportSettings'));

type Props = { module: FlowModuleItemSchema; onClose: () => void };

const Header = ({ module, onClose }: Props) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();
  const { nodes, edges, onFixView } = useFlowProviderStore();

  const { mutate: onclickSave, isLoading } = useRequest({
    mutationFn: () => {
      const modules = flowNode2Modules({ nodes, edges });
      // check required connect
      for (let i = 0; i < modules.length; i++) {
        const item = modules[i];
        if (item.inputs.find((input) => input.required && !input.connected)) {
          return Promise.reject(`【${item.name}】存在未连接的必填输入`);
        }
        if (item.inputs.find((input) => input.valueCheck && !input.valueCheck(input.value))) {
          return Promise.reject(`【${item.name}】存在为填写的必填项`);
        }
      }

      return putUpdateModule({
        id: module._id,
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
          {module.name}
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

        <MyTooltip label={'保存配置'}>
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
    </>
  );
};

export default React.memo(Header);
