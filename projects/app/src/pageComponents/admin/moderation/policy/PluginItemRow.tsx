import React from 'react';
import { Box, Button, Flex, HStack, Text } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { AdminModerationPluginItemType } from '@fastgpt/global/core/plugin/moderation/type';

type PluginItemRowProps = {
  plugin: AdminModerationPluginItemType;
  isActive: boolean;
  isModerationEnabled?: boolean;
  isLastPlugin?: boolean;
  isActivating?: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

const PluginItemRow: React.FC<PluginItemRowProps> = ({
  plugin,
  isActive,
  isModerationEnabled = false,
  isLastPlugin = false,
  isActivating = false,
  onActivate,
  onEdit,
  onDelete
}) => {
  const { t } = useSafeTranslation();

  const isConfigured = !!plugin.hasConfiguredSecrets;
  const shouldBypassConfirm =
    isLastPlugin || Boolean(plugin.enabled) || Boolean(isModerationEnabled && isActive);

  return (
    <Flex
      alignItems={'center'}
      minH={'56px'}
      borderBottom={'1px solid'}
      borderColor={'myGray.100'}
      _last={{ borderBottom: 'none' }}
      _hover={{ bg: 'myGray.50' }}
      transition={'background 0.2s'}
    >
      {/* Plugin name column (180px). */}
      <Flex w={'180px'} alignItems={'center'} gap={2} flexShrink={0} px={6} minW={0}>
        <Avatar src={plugin.icon} w={'20px'} h={'20px'} borderRadius={'md'} flexShrink={0} />
        <MyTooltip
          label={plugin.name || plugin.pluginId}
          placement="top"
          showOnlyWhenOverflow
          shouldWrapChildren={false}
        >
          <Box minW={0} isTruncated fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
            {plugin.name || plugin.pluginId}
          </Box>
        </MyTooltip>
      </Flex>

      {/* 3. 描述 (自适应 flex: 1，严格单行超出省略) */}
      <Box flex={'1 1 0'} minW={0} px={6} overflow={'hidden'}>
        <MyTooltip
          label={plugin.description || ''}
          placement="top"
          showOnlyWhenOverflow
          shouldWrapChildren={false}
        >
          <Box minW={0} isTruncated fontSize={'sm'} color={'myGray.600'}>
            {plugin.description || t('admin:moderation.no_description')}
          </Box>
        </MyTooltip>
      </Box>

      {/* Status column (100px), before the actions as in the header. */}
      <Flex w={'100px'} px={6} alignItems={'center'} flexShrink={0}>
        <Text
          fontSize={'sm'}
          fontWeight={'medium'}
          color={isConfigured ? 'primary.600' : 'red.600'}
        >
          {isConfigured
            ? t('admin:moderation.status_configured')
            : t('admin:moderation.status_unconfigured')}
        </Text>
      </Flex>
      {/* Actions column (180px). */}
      <Flex w={'180px'} px={6} justifyContent={'flex-end'} alignItems={'center'} flexShrink={0}>
        <HStack spacing={2}>
          {/* 启用 / 使用中按钮：已启用插件不可直接取消启用，只能关闭内容审核服务或切换其他插件 */}
          {isActive ? (
            <Button variant={'whiteBase'} size={'sm'} h={'32px'} px={3} fontSize={'xs'} isDisabled>
              {t('admin:moderation.in_use')}
            </Button>
          ) : isConfigured ? (
            <Button
              variant={'whiteBase'}
              size={'sm'}
              h={'32px'}
              px={3}
              fontSize={'xs'}
              isLoading={isActivating}
              onClick={(e) => {
                e.stopPropagation();
                onActivate();
              }}
            >
              {t('admin:moderation.enable')}
            </Button>
          ) : (
            <MyTooltip
              label={t('admin:moderation.configure_params_first')}
              placement="bottom"
              shouldWrapChildren
            >
              <Button
                variant={'whiteBase'}
                size={'sm'}
                h={'32px'}
                px={3}
                fontSize={'xs'}
                isDisabled
              >
                {t('admin:moderation.enable')}
              </Button>
            </MyTooltip>
          )}

          {/* 编辑配置按钮 */}
          <MyIconButton
            icon="common/setting"
            tip={t('admin:moderation.configure_params')}
            size={'16px'}
            w={'24px'}
            h={'24px'}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          />

          {/* 删除插件按钮：仅剩最后一个插件或当前正处于生效/禁止卸载状态时交由外层 Modal/提示处理，其余可卸载的普通插件统一经过气泡二次确认 */}
          {shouldBypassConfirm ? (
            <MyIconButton
              icon="common/trash"
              tip={t('admin:moderation.uninstall_plugin')}
              size={'16px'}
              w={'24px'}
              h={'24px'}
              hoverBg="red.50"
              hoverColor="red.600"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            />
          ) : (
            <PopoverConfirm
              type="delete"
              content={t('admin:moderation.confirm_uninstall_plugin')}
              onConfirm={onDelete}
              Trigger={
                <MyIconButton
                  icon="common/trash"
                  tip={t('admin:moderation.uninstall_plugin')}
                  size={'16px'}
                  w={'24px'}
                  h={'24px'}
                  hoverBg="red.50"
                  hoverColor="red.600"
                />
              }
            />
          )}
        </HStack>
      </Flex>
    </Flex>
  );
};

export default PluginItemRow;
