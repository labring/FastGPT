import { Box, Button, Flex, Grid, useDisclosure, useMediaQuery, Text } from '@chakra-ui/react';
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { SmallAddIcon } from '@chakra-ui/icons';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { theme } from '@fastgpt/web/styles/theme';
import { hoverDeleteStyles } from '@fastgpt/web/components/common/Icon/delete';
import ToolSelectModal from './ToolSelectModal';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { checkAppUnExistError } from '@fastgpt/global/core/app/utils';
import { defaultNodeVersion, FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { keyframes } from '@emotion/react';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { spacing, formStyles } from './HomeTable';

// 定义粉碎动画关键帧
const shatterKeyframes = keyframes`
  0% {
    opacity: 1;
    transform: scale(1);
    filter: blur(0);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.7) rotate(5deg) translateY(10px);
    filter: blur(2px);
  }
  100% {
    opacity: 0;
    transform: scale(0.2) rotate(-5deg) translateY(15px);
    filter: blur(4px);
  }
`;

// 定义淡入动画关键帧
const fadeInKeyframes = keyframes`
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
`;

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
  isDeleting?: boolean; // 添加删除状态标记
};

// 组件 ref 类型定义
export type ToolSelectRefType = {
  getSelectedTools: () => ToolItemType[];
};

type ToolSelectProps = {
  defaultTools?: ToolItemType[];
  onChange?: () => void;
  isLoading?: boolean;
};

const ToolSelect = React.forwardRef<ToolSelectRefType, ToolSelectProps>(
  ({ defaultTools = [], onChange, isLoading = false }, ref) => {
    const { t } = useTranslation();
    const [selectedTools, setSelectedTools] = useState<ToolItemType[]>(defaultTools);
    // 使用 ref 来跟踪选中工具变化
    const prevToolsRef = useRef<string[]>([]);

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

    // 修改 useEffect，只在插件 ID 列表真正变化时才触发 onChange
    useEffect(() => {
      // 比较当前插件 ID 和前一次的插件 ID
      const prevPluginIds = prevToolsRef.current;
      const currentPluginIds = selectedPluginIds;

      // 检查是否有变化
      const hasChanged =
        prevPluginIds.length !== currentPluginIds.length ||
        prevPluginIds.some((id, index) => id !== currentPluginIds[index]);

      // 只有在真正变化时才调用 onChange
      if (hasChanged && onChange) {
        onChange();
        // 更新 ref 以保存当前值
        prevToolsRef.current = [...currentPluginIds];
      }
    }, [selectedPluginIds, onChange]);

    // 初始化 prevToolsRef
    useEffect(() => {
      prevToolsRef.current = selectedPluginIds;
    }, [selectedPluginIds]);

    // useEffect 监听 defaultTools 变化更新 selectedTools
    useEffect(() => {
      if (defaultTools && defaultTools.length > 0) {
        setSelectedTools(defaultTools);
      }
    }, [defaultTools]);

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

        // 保留未被移除的工具s
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
      // 先设置删除标记，触发动画
      setSelectedTools((prevTools) =>
        prevTools.map((tool) => (tool.id === toolId ? { ...tool, isDeleting: true } : tool))
      );

      // 设置延时，等待动画完成后再从数组中移除
      setTimeout(() => {
        setSelectedTools((prevTools) => prevTools.filter((tool) => tool.id !== toolId));
      }, 150); // 动画持续时间缩短到150ms
    }, []);

    // 获取选中工具的方法
    const getSelectedTools = useCallback(
      () => selectedTools.filter((tool) => !tool.isDeleting),
      [selectedTools]
    );

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
        {/* 标题区域 */}
        <Flex alignItems="center" justifyContent="space-between" width="100%">
          <Flex alignItems="center" gap={spacing.xs}>
            <Text
              fontWeight={formStyles.fontWeight}
              fontSize={formStyles.fontSize}
              lineHeight={formStyles.lineHeight}
              letterSpacing={formStyles.letterSpacing}
              color="myGray.700"
            >
              {t('common:core.app.Tool call')}
            </Text>
            <QuestionTip ml={1} label={t('app:plugin_dispatch_tip')} />
          </Flex>

          {/* 已有工具时显示新增按钮 */}
          {selectedTools.length > 0 && (
            <Button
              size="sm"
              colorScheme="primary"
              variant="outline"
              leftIcon={<SmallAddIcon />}
              onClick={onOpenToolsSelect}
              _hover={{ bg: 'blue.50' }}
            >
              {t('common:common.Add')}
            </Button>
          )}
        </Flex>

        {/* 工具容器 */}
        {selectedTools.length > 0 ? (
          <Box mt={0}>
            <Grid gridTemplateColumns={'repeat(3, minmax(0, 1fr))'} gridGap={[2, 4]}>
              {selectedTools.map((item) => {
                const hasError = checkAppUnExistError(item.pluginData?.error);

                return (
                  <MyTooltip key={item.id} label={item.intro}>
                    <Flex
                      overflow={'hidden'}
                      display={'flex'}
                      height={'40px'}
                      padding={'8px 12px'}
                      flexDirection={'row'}
                      justifyContent={'flex-start'}
                      alignItems={'center'}
                      flex={'1 0 0'}
                      borderRadius={'6px'}
                      border={'0.5px solid var(--Gray-Modern-200, #E8EBF0)'}
                      background={'#FFF'}
                      boxShadow={
                        '0px 4px 4px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
                      }
                      _hover={{
                        transform: 'translateY(-2px)',
                        borderRadius: '6px',
                        border: '0.5px solid var(--Gray-Modern-200, #E8EBF0)',
                        background: '#FFF',
                        boxShadow:
                          '0px 4px 4px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
                      }}
                      cursor={'pointer'}
                      transition="all 0.2s ease"
                      position="relative"
                      role="group"
                      animation={
                        item.isDeleting ? `${shatterKeyframes} 0.15s ease forwards` : undefined
                      }
                    >
                      <Flex alignItems="center" width="100%">
                        <Avatar src={item.avatar} borderRadius={'6px'} w={'20px'} h={'20px'} />
                        <Box
                          ml={'6px'}
                          className={'textEllipsis'}
                          fontSize={'sm'}
                          fontWeight="medium"
                          color={'myGray.900'}
                          flex="1"
                        >
                          {item.name}
                        </Box>
                        <Flex
                          className="delete"
                          alignItems="center"
                          justifyContent="center"
                          ml={2}
                          w="22px"
                          h="22px"
                          borderRadius="sm"
                          cursor="pointer"
                          transition="all 0.2s"
                          _hover={{
                            background: 'rgba(17, 24, 36, 0.05)',
                            color: 'red.600'
                          }}
                          onClick={(e) => {
                            // 仅阻止删除按钮的点击事件冒泡
                            e.stopPropagation();
                            handleDeleteTool(item.id);
                          }}
                          opacity="0"
                          _groupHover={{
                            opacity: 1,
                            animation: `${fadeInKeyframes} 0.2s ease`
                          }}
                        >
                          <MyIcon
                            className="delete"
                            name={'delete' as any}
                            w={'16px'}
                            h={'16px'}
                            color={'inherit'}
                          />
                        </Flex>
                      </Flex>
                      {hasError && (
                        <MyTooltip label={t('app:app.modules.not_found_tips')}>
                          <Flex
                            bg={'red.50'}
                            alignItems={'center'}
                            h={6}
                            px={2}
                            rounded={'md'}
                            fontSize={'xs'}
                            fontWeight={'medium'}
                          >
                            <MyIcon name={'common/errorFill'} w={'14px'} mr={1} />
                            <Box color={'red.600'}>{t('app:app.modules.not_found')}</Box>
                          </Flex>
                        </MyTooltip>
                      )}
                    </Flex>
                  </MyTooltip>
                );
              })}
            </Grid>
          </Box>
        ) : (
          <Box
            mt={0}
            display="flex"
            width="640px"
            height="80px"
            justifyContent="center"
            alignItems="center"
            borderRadius="4px"
            border="1px dashed var(--Gray-Modern-250, #DFE2EA)"
            cursor="pointer"
            onClick={onOpenToolsSelect}
            _hover={{
              borderColor: 'primary.300',
              bg: 'gray.100',
              '.hoverContent': { color: 'primary.500' }
            }}
            transition="all 0.2s"
            position="relative"
          >
            <Flex
              alignItems="center"
              justifyContent="center"
              flexDirection="column"
              color="gray.500"
            >
              {isLoading ? (
                <Flex
                  alignItems="center"
                  justifyContent="center"
                  flexDirection="column"
                  h="full"
                  py={4}
                >
                  <Box
                    as="span"
                    display="inline-block"
                    width="30px"
                    height="30px"
                    borderRadius="full"
                    borderWidth="2px"
                    borderColor="primary.500"
                    borderLeftColor="transparent"
                    animation="spin 1s linear infinite"
                    mb={2}
                  />
                  <Text fontSize="sm" fontWeight="500">
                    {t('common:common.Loading')}
                  </Text>
                </Flex>
              ) : (
                <>
                  <Flex
                    className="hoverContent"
                    alignItems="center"
                    justifyContent="center"
                    flexDirection="row"
                    gap={'6px'}
                  >
                    <SmallAddIcon boxSize={5} />
                    <Box fontSize="sm" fontWeight="medium">
                      {t('common:common.Add')}
                    </Box>
                  </Flex>
                </>
              )}
            </Flex>
          </Box>
        )}

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
