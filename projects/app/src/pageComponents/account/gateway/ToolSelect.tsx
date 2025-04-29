import { Box, Button, Flex, Grid, useDisclosure } from '@chakra-ui/react';
import React, { useMemo, useState, useCallback } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { SmallAddIcon } from '@chakra-ui/icons';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { theme } from '@fastgpt/web/styles/theme';
import DeleteIcon, { hoverDeleteStyles } from '@fastgpt/web/components/common/Icon/delete';
import ToolSelectModal from './ToolSelectModal';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { checkAppUnExistError } from '@fastgpt/global/core/app/utils';
import { defaultNodeVersion } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node.d';

// 定义工具项的类型
export type ToolItemType = {
  id: string;
  name: string;
  pluginId?: string;
  avatar?: string;
  intro?: string;
  inputs: any[];
  outputs: any[];
  flowNodeType: string;
  version: string;
  templateType: string;
  pluginData?: {
    error?: string;
  };
};

// 组件 ref 类型定义
export type ToolSelectRefType = {
  getSelectedTools: () => ToolItemType[];
};

type ToolSelectProps = {
  defaultTools?: ToolItemType[];
};

const ToolSelect = React.forwardRef<ToolSelectRefType, ToolSelectProps>(
  ({ defaultTools = [] }, ref) => {
    const { t } = useTranslation();
    const [selectedTools, setSelectedTools] = useState<ToolItemType[]>(defaultTools);

    const {
      isOpen: isOpenToolsSelect,
      onOpen: onOpenToolsSelect,
      onClose: onCloseToolsSelect
    } = useDisclosure();

    // 使用 useMemo 缓存计算结果，避免不必要的重新计算
    const selectedPluginIds = useMemo(
      () => selectedTools.map((tool) => tool.pluginId).filter(Boolean) as string[],
      [selectedTools]
    );

    // 使用 useCallback 缓存函数，防止不必要的重新创建
    const handleSelectPlugins = useCallback((selectedPlugins: NodeTemplateListItemType[]) => {
      setSelectedTools((prevTools) => {
        // 获取所有已选择的插件ID
        const newPluginIds = new Set(selectedPlugins.map((plugin) => plugin.id));

        // 创建映射以便快速查找
        const pluginMap = new Map<string, NodeTemplateListItemType>();
        selectedPlugins.forEach((plugin) => {
          pluginMap.set(plugin.id, plugin);
        });

        // 保留未被移除的工具
        const remainingTools = prevTools.filter(
          (tool) => !tool.pluginId || newPluginIds.has(tool.pluginId)
        );

        // 找出需要添加的新插件
        const existingIds = new Set(remainingTools.map((tool) => tool.pluginId).filter(Boolean));
        const newTools: ToolItemType[] = [];

        // 高效添加新工具，避免多次遍历
        newPluginIds.forEach((id) => {
          if (!existingIds.has(id)) {
            const plugin = pluginMap.get(id);
            if (plugin) {
              newTools.push({
                id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                name: plugin.name,
                pluginId: plugin.id,
                avatar: plugin.avatar,
                intro: plugin.intro || '',
                inputs: [],
                outputs: [],
                flowNodeType: plugin.flowNodeType || FlowNodeTypeEnum.tool,
                version: defaultNodeVersion,
                templateType: plugin.templateType || FlowNodeTemplateTypeEnum.tools
              });
            }
          }
        });

        return [...remainingTools, ...newTools];
      });
    }, []);

    const handleDeleteTool = useCallback((toolId: string) => {
      setSelectedTools((prevTools) => prevTools.filter((tool) => tool.id !== toolId));
    }, []);

    // 获取选中工具的方法
    const getSelectedTools = useCallback(() => selectedTools, [selectedTools]);

    // 添加到组件实例上，方便外部访问
    React.useImperativeHandle(
      ref,
      () => ({
        getSelectedTools
      }),
      [getSelectedTools]
    );

    return (
      <>
        <Flex alignItems={'center'}>
          <Button
            variant={'transparentBase'}
            leftIcon={<SmallAddIcon />}
            iconSpacing={1}
            mr={'-5px'}
            size={'sm'}
            fontSize={'sm'}
            onClick={onOpenToolsSelect}
          >
            {t('common:common.Choose')}
          </Button>
        </Flex>

        {/* 显示已选工具列表 */}
        <Grid
          mt={selectedTools.length > 0 ? 2 : 0}
          gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
          gridGap={[2, 4]}
        >
          {selectedTools.map((item) => {
            const hasError = checkAppUnExistError(item.pluginData?.error);

            return (
              <MyTooltip key={item.id} label={item.intro}>
                <Flex
                  overflow={'hidden'}
                  alignItems={'center'}
                  p={2.5}
                  bg={'white'}
                  boxShadow={'0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)'}
                  borderRadius={'md'}
                  border={theme.borders.base}
                  borderColor={hasError ? 'red.600' : ''}
                  _hover={{
                    ...hoverDeleteStyles,
                    borderColor: hasError ? 'red.600' : 'primary.300'
                  }}
                  cursor={'pointer'}
                >
                  <Avatar src={item.avatar} w={'1.5rem'} h={'1.5rem'} borderRadius={'sm'} />
                  <Box
                    flex={'1 0 0'}
                    ml={2}
                    gap={2}
                    className={'textEllipsis'}
                    fontSize={'sm'}
                    color={'myGray.900'}
                  >
                    {item.name}
                  </Box>
                  {hasError && (
                    <MyTooltip label={t('app:app.modules.not_found_tips')}>
                      <Flex
                        bg={'red.50'}
                        alignItems={'center'}
                        h={6}
                        px={2}
                        rounded={'6px'}
                        fontSize={'xs'}
                        fontWeight={'medium'}
                      >
                        <MyIcon name={'common/errorFill'} w={'14px'} mr={1} />
                        <Box color={'red.600'}>{t('app:app.modules.not_found')}</Box>
                      </Flex>
                    </MyTooltip>
                  )}
                  <DeleteIcon
                    ml={2}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTool(item.id);
                    }}
                  />
                </Flex>
              </MyTooltip>
            );
          })}
        </Grid>

        {/* 工具选择弹窗 */}
        {isOpenToolsSelect && (
          <ToolSelectModal
            selectedPluginIds={selectedPluginIds}
            onSelectPlugins={handleSelectPlugins}
            onCancel={onCloseToolsSelect}
          />
        )}
      </>
    );
  }
);

// 添加显示名称，有助于调试
ToolSelect.displayName = 'ToolSelect';

export default React.memo(ToolSelect);
