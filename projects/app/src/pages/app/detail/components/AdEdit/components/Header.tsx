import React, { useCallback, useRef, useState } from 'react';
import { Box, Flex, IconButton, useTheme, useDisclosure } from '@chakra-ui/react';
import { SmallCloseIcon } from '@chakra-ui/icons';
import { FlowInputItemTypeEnum } from '@/constants/flow';
import { FlowOutputTargetItemType } from '@/types/core/app/flow';
import { AppModuleItemType } from '@/types/app';
import { useRequest } from '@/web/common/hooks/useRequest';
import type { AppSchema } from '@/types/mongoSchema';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { AppTypeEnum, SystemOutputEnum } from '@/constants/app';
import dynamic from 'next/dynamic';

import MyIcon from '@/components/Icon';
import MyTooltip from '@/components/MyTooltip';
import ChatTest, { type ChatTestComponentRef } from './ChatTest';
import { useFlowStore } from './Provider';

const ImportSettings = dynamic(() => import('./ImportSettings'));

type Props = { app: AppSchema; onCloseSettings: () => void };

const RenderHeaderContainer = React.memo(function RenderHeaderContainer({
  app,
  ChatTestRef,
  testModules,
  setTestModules,
  onCloseSettings
}: Props & {
  ChatTestRef: React.RefObject<ChatTestComponentRef>;
  testModules?: AppModuleItemType[];
  setTestModules: React.Dispatch<AppModuleItemType[] | undefined>;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();
  const { updateAppDetail } = useUserStore();

  const { nodes, edges, onFixView } = useFlowStore();

  const flow2AppModules = useCallback(() => {
    const modules: AppModuleItemType[] = nodes.map((item) => ({
      moduleId: item.data.moduleId,
      name: item.data.name,
      flowType: item.data.flowType,
      showStatus: item.data.showStatus,
      position: item.position,
      inputs: item.data.inputs.map((item) => ({
        ...item,
        connected: item.connected ?? item.type !== FlowInputItemTypeEnum.target
      })),
      outputs: item.data.outputs
        .map((item) => ({
          ...item,
          targets: [] as FlowOutputTargetItemType[]
        }))
        .sort((a, b) => (a.key === SystemOutputEnum.finish ? 1 : -1)) // finish output always at last
    }));

    // update inputs and outputs
    modules.forEach((module) => {
      module.inputs.forEach((input) => {
        input.connected =
          input.connected ||
          !!edges.find(
            (edge) => edge.target === module.moduleId && edge.targetHandle === input.key
          );
      });
      module.outputs.forEach((output) => {
        output.targets = edges
          .filter(
            (edge) =>
              edge.source === module.moduleId &&
              edge.sourceHandle === output.key &&
              edge.targetHandle
          )
          .map((edge) => ({
            moduleId: edge.target,
            key: edge.targetHandle || ''
          }));
      });
    });
    return modules;
  }, [edges, nodes]);

  const { mutate: onclickSave, isLoading } = useRequest({
    mutationFn: () => {
      const modules = flow2AppModules();
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
        modules: modules,
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
              onCloseSettings();
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
                JSON.stringify(flow2AppModules(), null, 2),
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
                setTestModules(flow2AppModules());
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

  const [testModules, setTestModules] = useState<AppModuleItemType[]>();

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
