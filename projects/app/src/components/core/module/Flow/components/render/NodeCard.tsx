import React, { useMemo } from 'react';
import { Box, Flex, useTheme, Menu, MenuButton, MenuList, MenuItem } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@/components/Avatar';
import type { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { useTranslation } from 'next-i18next';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import { useToast } from '@/web/common/hooks/useToast';
import { onChangeNode, onCopyNode, onResetNode, onDelNode } from '../../FlowProvider';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getPreviewPluginModule } from '@/web/core/plugin/api';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useConfirm } from '@/web/common/hooks/useConfirm';
import { LOGO_ICON } from '@fastgpt/global/common/system/constants';

type Props = FlowModuleItemType & {
  children?: React.ReactNode | React.ReactNode[] | string;
  minW?: string | number;
  isPreview?: boolean;
};

const NodeCard = (props: Props) => {
  const { t } = useTranslation();
  const {
    children,
    avatar = LOGO_ICON,
    name = t('core.module.template.UnKnow Module'),
    intro,
    minW = '300px',
    moduleId,
    flowType,
    inputs,
    isPreview
  } = props;

  const theme = useTheme();
  const { toast } = useToast();
  const { setLoading } = useSystemStore();

  // custom title edit
  const { onOpenModal, EditModal: EditTitleModal } = useEditTitle({
    title: t('common.Custom Title'),
    placeholder: t('app.module.Custom Title Tip') || ''
  });
  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('module.Confirm Sync Plugin')
  });

  const menuList = useMemo(
    () => [
      ...(flowType === FlowNodeTypeEnum.pluginModule
        ? [
            {
              icon: 'common/refreshLight',
              label: t('plugin.Synchronous version'),
              onClick: () => {
                const pluginId = inputs.find((item) => item.key === ModuleInputKeyEnum.pluginId)
                  ?.value;
                if (!pluginId) return;
                openConfirm(async () => {
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
        onClick: () => onCopyNode(moduleId)
      },
      {
        icon: 'delete',
        label: t('common.Delete'),
        onClick: () => onDelNode(moduleId)
      },

      {
        icon: 'common/backLight',
        label: t('common.Back'),
        onClick: () => {}
      }
    ],
    [flowType, inputs, moduleId, name, onOpenModal, openConfirm, setLoading, t, toast]
  );

  return (
    <Box
      minW={minW}
      maxW={'500px'}
      bg={'white'}
      border={theme.borders.md}
      borderRadius={'md'}
      boxShadow={'sm'}
      className={isPreview ? 'nodrag' : ''}
    >
      <Flex className="custom-drag-handle" px={4} py={3} alignItems={'center'}>
        <Avatar src={avatar} borderRadius={'md'} objectFit={'contain'} w={'30px'} h={'30px'} />
        <Box ml={3} fontSize={'lg'} color={'myGray.600'}>
          {t(name)}
        </Box>
        {intro && (
          <MyTooltip label={t(intro)} forceShow>
            <QuestionOutlineIcon display={['none', 'inline']} mb={'1px'} ml={1} />
          </MyTooltip>
        )}
        <Box flex={1} />
        {!isPreview && (
          <Menu autoSelect={false} isLazy>
            <MenuButton
              className={'nodrag'}
              _hover={{ bg: 'myWhite.600' }}
              cursor={'pointer'}
              borderRadius={'md'}
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <MyIcon name={'more'} w={'14px'} p={2} />
            </MenuButton>
            <MenuList color={'myGray.700'} minW={`120px !important`} zIndex={10}>
              {menuList.map((item) => (
                <MenuItem key={item.label} onClick={item.onClick} py={[2, 3]}>
                  <MyIcon name={item.icon as any} w={['14px', '16px']} />
                  <Box ml={[1, 2]}>{item.label}</Box>
                </MenuItem>
              ))}
            </MenuList>
          </Menu>
        )}
      </Flex>
      {children}
      <EditTitleModal />
      <ConfirmModal />
    </Box>
  );
};

export default React.memo(NodeCard);
