import React, { useCallback, useRef, useState } from 'react';
import { Box, Flex, IconButton, useTheme, useDisclosure } from '@chakra-ui/react';
import { SmallCloseIcon } from '@chakra-ui/icons';
import { ModuleItemType } from '@fastgpt/global/core/module/type';
import { useRequest } from '@/web/common/hooks/useRequest';
import { AppSchema } from '@fastgpt/global/core/app/type.d';
import { useTranslation } from 'next-i18next';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import dynamic from 'next/dynamic';

import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@/components/MyTooltip';
import ChatTest, { type ChatTestComponentRef } from '@/components/core/module/Flow/ChatTest';
import { getFlowStore } from '@/components/core/module/Flow/FlowProvider';
import { flowNode2Modules, filterExportModules } from '@/components/core/module/utils';
import { useAppStore } from '@/web/core/app/store/useAppStore';
import { useToast } from '@/web/common/hooks/useToast';
import { useConfirm } from '@/web/common/hooks/useConfirm';

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
  const { toast } = useToast();
  const { t } = useTranslation();
  const { copyData } = useCopyData();
  const { openConfirm: openConfirmOut, ConfirmModal } = useConfirm({
    content: t('core.app.edit.Out Ad Edit')
  });
  const { isOpen: isOpenImport, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();
  const { updateAppDetail } = useAppStore();

  const flow2ModulesAndCheck = useCallback(async () => {
    const { nodes, edges } = await getFlowStore();

    const modules = flowNode2Modules({ nodes, edges });
    // check required connect
    for (let i = 0; i < modules.length; i++) {
      const item = modules[i];

      const unconnected = item.inputs.find((input) => {
        if (!input.required || input.connected) {
          return false;
        }
        if (input.value === undefined || input.value === '' || input.value?.length === 0) {
          return true;
        }
        return false;
      });

      if (unconnected) {
        const msg = `【${t(item.name)}】存在未填或未连接参数`;

        toast({
          status: 'warning',
          title: msg
        });
        return false;
      }
    }
    return modules;
  }, [t, toast]);

  const { mutate: onclickSave, isLoading } = useRequest({
    mutationFn: async (modules: ModuleItemType[]) => {
      return updateAppDetail(app._id, {
        modules: modules,
        type: AppTypeEnum.advanced,
        permission: undefined
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
        <MyTooltip label={t('common.Back')} offset={[10, 10]}>
          <IconButton
            size={'smSquare'}
            icon={<MyIcon name={'common/backLight'} w={'14px'} />}
            borderColor={'myGray.300'}
            variant={'whiteBase'}
            aria-label={''}
            onClick={openConfirmOut(async () => {
              const modules = await flow2ModulesAndCheck();
              if (modules) {
                await onclickSave(modules);
              }
              onClose();
            }, onClose)}
          />
        </MyTooltip>
        <Box ml={[3, 6]} fontSize={['md', '2xl']} flex={1}>
          {app.name}
        </Box>

        <MyTooltip label={t('app.Import Configs')}>
          <IconButton
            mr={[3, 6]}
            size={'smSquare'}
            icon={<MyIcon name={'common/importLight'} w={['14px', '16px']} />}
            variant={'whitePrimary'}
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

        {testModules ? (
          <IconButton
            mr={[3, 6]}
            icon={<SmallCloseIcon fontSize={'25px'} />}
            variant={'whitePrimary'}
            size={'smSquare'}
            aria-label={''}
            onClick={() => setTestModules(undefined)}
          />
        ) : (
          <MyTooltip label={'测试对话'}>
            <IconButton
              mr={[3, 6]}
              icon={<MyIcon name={'core/chat/chatLight'} w={['14px', '16px']} />}
              size={'smSquare'}
              aria-label={'save'}
              variant={'whitePrimary'}
              onClick={async () => {
                const modules = await flow2ModulesAndCheck();
                if (modules) {
                  setTestModules(modules);
                }
              }}
            />
          </MyTooltip>
        )}

        <MyTooltip label={'保存配置'}>
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
      <ConfirmModal
        closeText={t('core.app.edit.UnSave')}
        confirmText={t('core.app.edit.Save and out')}
      />
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
