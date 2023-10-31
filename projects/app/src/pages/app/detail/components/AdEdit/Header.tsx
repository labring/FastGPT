import React, { useCallback, useRef, useState } from 'react';
import { Box, Flex, IconButton, useTheme, useDisclosure } from '@chakra-ui/react';
import { SmallCloseIcon } from '@chakra-ui/icons';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { FlowNodeOutputTargetItemType } from '@fastgpt/global/core/module/node/type';
import { ModuleItemType } from '@fastgpt/global/core/module/type';
import { useRequest } from '@/web/common/hooks/useRequest';
import type { AppSchema } from '@/types/mongoSchema';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { AppTypeEnum } from '@/constants/app';
import dynamic from 'next/dynamic';

import MyIcon from '@/components/Icon';
import MyTooltip from '@/components/MyTooltip';
import ChatTest, { type ChatTestComponentRef } from '@/components/core/module/Flow/ChatTest';
import { flowNode2Modules, useFlowProviderStore } from '@/components/core/module/Flow/FlowProvider';

const ImportSettings = dynamic(() => import('@/components/core/module/Flow/ImportSettings'));

type Props = { app: AppSchema; onClose: () => void };

const RenderHeaderContainer = React.memo(function RenderHeaderContainer({
  app,
  ChatTestRef,
  testModules,
  setTestModules,
  onClose
}: Props & {
  ChatTestRef: React.RefObject<ChatTestComponentRef>;
  testModules?: ModuleItemType[];
  setTestModules: React.Dispatch<ModuleItemType[] | undefined>;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();
  const { updateAppDetail } = useUserStore();

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

      return updateAppDetail(app._id, {
        modules,
        type: AppTypeEnum.advanced
      });
    },
    successToast: '保存配置成功',
    errorToast: '保存配置异常',
    onSuccess() {
      ChatTestRef.current?.resetChatTest();
    }
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
          {app.name}
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

        {testModules ? (
          <IconButton
            mr={[3, 6]}
            icon={<SmallCloseIcon fontSize={'25px'} />}
            variant={'base'}
            color={'myGray.600'}
            borderRadius={'lg'}
            aria-label={''}
            onClick={() => setTestModules(undefined)}
          />
        ) : (
          <MyTooltip label={'测试对话'}>
            <IconButton
              mr={[3, 6]}
              icon={<MyIcon name={'chat'} w={['14px', '16px']} />}
              borderRadius={'lg'}
              aria-label={'save'}
              variant={'base'}
              onClick={() => {
                setTestModules(flowNode2Modules({ nodes, edges }));
              }}
            />
          </MyTooltip>
        )}

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
});

const Header = (props: Props) => {
  const { app } = props;
  const ChatTestRef = useRef<ChatTestComponentRef>(null);

  const [testModules, setTestModules] = useState<ModuleItemType[]>();

  return (
    <>
      <RenderHeaderContainer
        {...props}
        ChatTestRef={ChatTestRef}
        testModules={testModules}
        setTestModules={setTestModules}
      />
      <ChatTest
        ref={ChatTestRef}
        modules={testModules}
        app={app}
        onClose={() => setTestModules(undefined)}
      />
    </>
  );
};

export default React.memo(Header);
