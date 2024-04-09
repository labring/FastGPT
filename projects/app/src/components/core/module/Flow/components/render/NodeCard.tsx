import React, { useMemo } from 'react';
import { Box, Button, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@/components/Avatar';
import type { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import { useTranslation } from 'next-i18next';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { onChangeNode, onCopyNode, onResetNode, useFlowProviderStore } from '../../FlowProvider';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getPreviewPluginModule } from '@/web/core/plugin/api';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';
import { ToolTargetHandle } from './ToolHandle';
import { useEditTextarea } from '@fastgpt/web/hooks/useEditTextarea';
import TriggerAndFinish from './RenderInput/templates/TriggerAndFinish';

type Props = FlowModuleItemType & {
  children?: React.ReactNode | React.ReactNode[] | string;
  minW?: string | number;
  maxW?: string | number;
  forbidMenu?: boolean;
  selected?: boolean;
};

const NodeCard = (props: Props) => {
  const { t } = useTranslation();
  const {
    children,
    avatar = LOGO_ICON,
    name = t('core.module.template.UnKnow Module'),
    intro,
    minW = '300px',
    maxW = '600px',
    moduleId,
    flowType,
    inputs,
    selected,
    forbidMenu,
    isTool = false
  } = props;

  const { toast } = useToast();
  const { setLoading } = useSystemStore();
  const { nodes, splitToolInputs, onDelNode } = useFlowProviderStore();
  // edit intro
  const { onOpenModal: onOpenIntroModal, EditModal: EditIntroModal } = useEditTextarea({
    title: t('core.module.Edit intro'),
    tip: '调整该模块会对工具调用时机有影响。\n你可以通过精确的描述该模块功能，引导模型进行工具调用。',
    canEmpty: false
  });
  // custom title edit
  const { onOpenModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('common.Custom Title'),
    placeholder: t('app.module.Custom Title Tip') || ''
  });
  const { openConfirm: onOpenConfirmSync, ConfirmModal: ConfirmSyncModal } = useConfirm({
    content: t('module.Confirm Sync Plugin')
  });
  const { openConfirm: onOpenConfirmDeleteNode, ConfirmModal: ConfirmDeleteModal } = useConfirm({
    content: t('core.module.Confirm Delete Node'),
    type: 'delete'
  });

  const showToolHandle = useMemo(
    () => isTool && !!nodes.find((item) => item.data?.flowType === FlowNodeTypeEnum.tools),
    [isTool, nodes]
  );
  const moduleIsTool = useMemo(() => {
    const { isTool } = splitToolInputs([], moduleId);
    return isTool;
  }, [moduleId, splitToolInputs]);

  const Header = useMemo(() => {
    const menuList = [
      ...(flowType === FlowNodeTypeEnum.pluginModule
        ? [
            {
              icon: 'common/refreshLight',
              label: t('plugin.Synchronous version'),
              variant: 'whiteBase',
              onClick: () => {
                const pluginId = inputs.find(
                  (item) => item.key === ModuleInputKeyEnum.pluginId
                )?.value;
                if (!pluginId) return;
                onOpenConfirmSync(async () => {
                  try {
                    setLoading(true);
                    const pluginModule = await getPreviewPluginModule(pluginId);
                    onResetNode({
                      id: moduleId,
                      module: pluginModule
                    });
                  } catch (e) {
                    return toast({
                      status: 'error',
                      title: getErrText(e, t('plugin.Get Plugin Module Detail Failed'))
                    });
                  }
                  setLoading(false);
                })();
              }
            }
          ]
        : [
            {
              icon: 'edit',
              label: t('common.Rename'),
              variant: 'whiteBase',
              onClick: () =>
                onOpenModal({
                  defaultVal: name,
                  onSuccess: (e) => {
                    if (!e) {
                      return toast({
                        title: t('app.modules.Title is required'),
                        status: 'warning'
                      });
                    }
                    onChangeNode({
                      moduleId,
                      type: 'attr',
                      key: 'name',
                      value: e
                    });
                  }
                })
            }
          ]),
      {
        icon: 'copy',
        label: t('common.Copy'),
        variant: 'whiteBase',
        onClick: () => onCopyNode(moduleId)
      },
      {
        icon: 'delete',
        label: t('common.Delete'),
        variant: 'whiteDanger',
        onClick: onOpenConfirmDeleteNode(() => onDelNode(moduleId))
      }
    ];

    return (
      <Box className="custom-drag-handle" px={4} py={3} position={'relative'}>
        {showToolHandle && <ToolTargetHandle moduleId={moduleId} />}
        <Flex alignItems={'center'}>
          <Avatar src={avatar} borderRadius={'0'} objectFit={'contain'} w={'30px'} h={'30px'} />
          <Box ml={3} fontSize={'lg'}>
            {t(name)}
          </Box>
        </Flex>
        {!forbidMenu && (
          <Box
            className="nodrag controller-menu"
            display={'none'}
            flexDirection={'column'}
            gap={3}
            position={'absolute'}
            top={'-20px'}
            right={0}
            transform={'translateX(90%)'}
            pl={'20px'}
            pr={'10px'}
            pb={'20px'}
            pt={'20px'}
          >
            {menuList.map((item) => (
              <Box key={item.icon}>
                <Button
                  size={'xs'}
                  variant={item.variant}
                  leftIcon={<MyIcon name={item.icon as any} w={'12px'} />}
                  onClick={item.onClick}
                >
                  {item.label}
                </Button>
              </Box>
            ))}
          </Box>
        )}
        <Flex alignItems={'flex-end'} py={1}>
          <Box fontSize={'xs'} color={'myGray.600'} flex={'1 0 0'}>
            {t(intro)}
          </Box>
          {moduleIsTool && (
            <Button
              size={'xs'}
              variant={'whiteBase'}
              onClick={() => {
                onOpenIntroModal({
                  defaultVal: intro,
                  onSuccess(e) {
                    onChangeNode({
                      moduleId,
                      type: 'attr',
                      key: 'intro',
                      value: e
                    });
                  }
                });
              }}
            >
              {t('core.module.Edit intro')}
            </Button>
          )}
        </Flex>
        {/* switch */}
        <TriggerAndFinish moduleId={moduleId} isTool={moduleIsTool} />
      </Box>
    );
  }, [
    flowType,
    t,
    onOpenConfirmDeleteNode,
    showToolHandle,
    moduleId,
    avatar,
    name,
    forbidMenu,
    intro,
    moduleIsTool,
    inputs,
    onOpenConfirmSync,
    setLoading,
    toast,
    onOpenModal,
    onDelNode,
    onOpenIntroModal
  ]);

  const RenderModal = useMemo(() => {
    return (
      <>
        <EditTitleModal maxLength={20} />
        {moduleIsTool && <EditIntroModal maxLength={500} />}
        <ConfirmSyncModal />
        <ConfirmDeleteModal />
      </>
    );
  }, [ConfirmDeleteModal, ConfirmSyncModal, EditIntroModal, EditTitleModal, moduleIsTool]);

  return (
    <Box
      minW={minW}
      maxW={maxW}
      bg={'white'}
      borderWidth={'1px'}
      borderColor={selected ? 'primary.600' : 'borderColor.base'}
      borderRadius={'md'}
      boxShadow={'1'}
      _hover={{
        boxShadow: '4',
        '& .controller-menu': {
          display: 'flex'
        }
      }}
    >
      {Header}
      <Box className="nowheel">{children}</Box>
      {RenderModal}
    </Box>
  );
};

export default React.memo(NodeCard);
