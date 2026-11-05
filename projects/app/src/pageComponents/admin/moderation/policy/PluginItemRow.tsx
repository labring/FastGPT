import React from 'react';
import { Box, Flex, HStack, Radio, Text } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { AdminModerationPluginItemType } from '@fastgpt/global/core/plugin/moderation/type';

type PluginItemRowProps = {
  plugin: AdminModerationPluginItemType;
  isActive: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

const PluginItemRow: React.FC<PluginItemRowProps> = ({
  plugin,
  isActive,
  onSelect,
  onEdit,
  onDelete
}) => {
  const { toast } = useToast();

  const isConfigured = !!plugin.hasConfiguredSecrets;

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 待配置状态不允许单选，点击提示配置参数
    if (!isConfigured) {
      toast({
        status: 'warning',
        title: '请先配置插件参数'
      });
      return;
    }
    onSelect();
  };

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
      {/* Selection column (48px). */}
      <Flex w={'48px'} alignItems={'center'} justifyContent={'center'} flexShrink={0}>
        <Radio
          isChecked={isActive}
          aria-label={plugin.name || plugin.pluginId}
          isReadOnly
          onClick={handleCheckboxClick}
        />
      </Flex>

      {/* Plugin name column (180px). */}
      <Flex w={'180px'} alignItems={'center'} gap={2} flexShrink={0} px={6} minW={0}>
        <Avatar src={plugin.icon} w={'20px'} h={'20px'} borderRadius={'md'} flexShrink={0} />
        <Text
          fontSize={'sm'}
          fontWeight={'medium'}
          color={'myGray.900'}
          isTruncated
          title={plugin.name || plugin.pluginId}
        >
          {plugin.name || plugin.pluginId}
        </Text>
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
            {plugin.description || '暂无介绍'}
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
          {isConfigured ? '已配置' : '待配置'}
        </Text>
      </Flex>
      {/* Actions column (100px). */}
      <Flex w={'100px'} justifyContent={'center'} alignItems={'center'} flexShrink={0}>
        <HStack spacing={2}>
          {/* 编辑配置按钮 */}
          <MyIconButton
            icon="common/setting"
            tip="配置参数"
            size={'16px'}
            w={'24px'}
            h={'24px'}
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          />

          {/* 删除插件按钮二次确认气泡 */}
          <PopoverConfirm
            type="delete"
            content="确认卸载该审核插件？已保存的配置将保留，可从插件市场重新安装恢复。"
            onConfirm={onDelete}
            Trigger={
              <MyIconButton
                icon="common/trash"
                tip="卸载插件"
                size={'16px'}
                w={'24px'}
                h={'24px'}
                hoverBg="red.50"
                hoverColor="red.600"
              />
            }
          />
        </HStack>
      </Flex>
    </Flex>
  );
};

export default PluginItemRow;
