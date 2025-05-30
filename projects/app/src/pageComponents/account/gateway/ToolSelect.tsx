import { Box, Button, Flex, Grid, useDisclosure, Text } from '@chakra-ui/react';
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { SmallAddIcon } from '@chakra-ui/icons';
import type { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { theme } from '@fastgpt/web/styles/theme';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { keyframes } from '@emotion/react';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

import { getWebLLMModel } from '@/web/common/system/utils';
import ToolSelectModal, {
  childAppSystemKey
} from '@/pageComponents/app/detail/Gate/components/ToolSelectModal';
import ConfigToolModal from '@/pageComponents/app/detail/Gate/components/ConfigToolModal';

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

// 样式常量
const spacing = {
  xs: 2
};

const formStyles = {
  fontWeight: 500,
  fontSize: '14px',
  lineHeight: '20px',
  letterSpacing: '0.1px'
};

const ToolSelect = ({
  appForm,
  setAppForm
}: {
  appForm: AppSimpleEditFormType;
  setAppForm: (newAppForm: AppSimpleEditFormType) => void;
}) => {
  const { t } = useTranslation();

  const [configTool, setConfigTool] = useState<
    AppSimpleEditFormType['selectedTools'][number] | null
  >(null);

  // 添加删除状态管理
  const [deletingToolIds, setDeletingToolIds] = useState<Set<string>>(new Set());

  const {
    isOpen: isOpenToolsSelect,
    onOpen: onOpenToolsSelect,
    onClose: onCloseToolsSelect
  } = useDisclosure();
  const selectedModel = getWebLLMModel(appForm.aiSettings.model);

  // 使用 useCallback 缓存删除函数
  const handleDeleteTool = useCallback(
    (toolId: string) => {
      // 先设置删除标记，触发动画
      setDeletingToolIds((prev) => new Set([...prev, toolId]));

      // 设置延时，等待动画完成后再从数组中移除
      setTimeout(() => {
        const newAppForm = {
          ...appForm,
          selectedTools: appForm.selectedTools.filter((tool) => tool.id !== toolId)
        };
        setAppForm(newAppForm);

        // 清除删除标记
        setDeletingToolIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(toolId);
          return newSet;
        });
      }, 150); // 动画持续时间缩短到150ms
    },
    [appForm, setAppForm]
  );

  return (
    <>
      {/* 标题区域 */}
      <Flex alignItems="center" justifyContent="space-between" width="100%">
        <Flex alignItems="center" gap={spacing.xs}>
          <Text
            ml={2}
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
        {appForm.selectedTools.length > 0 && (
          <Button
            size="sm"
            colorScheme="primary"
            variant="outline"
            leftIcon={<SmallAddIcon />}
            onClick={onOpenToolsSelect}
            _hover={{ bg: 'blue.50' }}
          >
            {t('common:Add')}
          </Button>
        )}
      </Flex>

      {/* 工具容器 */}
      {appForm.selectedTools.length > 0 ? (
        <Box mt={2}>
          <Grid gridTemplateColumns={'repeat(3, minmax(0, 1fr))'} gridGap={[2, 4]}>
            {appForm.selectedTools.map((item) => {
              const isDeleting = deletingToolIds.has(item.id);

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
                    animation={isDeleting ? `${shatterKeyframes} 0.15s ease forwards` : undefined}
                    onClick={() => {
                      if (
                        item.inputs
                          .filter((input) => !childAppSystemKey.includes(input.key))
                          .every(
                            (input) =>
                              input.toolDescription ||
                              input.renderTypeList.includes(FlowNodeInputTypeEnum.selectLLMModel) ||
                              input.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)
                          ) ||
                        item.flowNodeType === FlowNodeTypeEnum.tool ||
                        item.flowNodeType === FlowNodeTypeEnum.toolSet
                      ) {
                        return;
                      }
                      setConfigTool(item);
                    }}
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
                  </Flex>
                </MyTooltip>
              );
            })}
          </Grid>
        </Box>
      ) : (
        <Box
          mt={2}
          display="flex"
          width="100%"
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
            className="hoverContent"
            alignItems="center"
            justifyContent="center"
            flexDirection="row"
            gap={'6px'}
            color="gray.500"
          >
            <SmallAddIcon boxSize={5} />
            <Box fontSize="sm" fontWeight="medium">
              {t('common:Choose')}
            </Box>
          </Flex>
        </Box>
      )}

      {isOpenToolsSelect && (
        <ToolSelectModal
          selectedTools={appForm.selectedTools}
          chatConfig={appForm.chatConfig}
          selectedModel={selectedModel}
          onAddTool={(e) => {
            const newAppForm = {
              ...appForm,
              selectedTools: [...appForm.selectedTools, e]
            };
            setAppForm(newAppForm);
          }}
          onRemoveTool={(e) => {
            const newAppForm = {
              ...appForm,
              selectedTools: appForm.selectedTools.filter((item) => item.pluginId !== e.id)
            };
            setAppForm(newAppForm);
          }}
          onClose={onCloseToolsSelect}
        />
      )}
      {configTool && (
        <ConfigToolModal
          configTool={configTool}
          onCloseConfigTool={() => setConfigTool(null)}
          onAddTool={(e) => {
            const newAppForm = {
              ...appForm,
              selectedTools: appForm.selectedTools.map((item) =>
                item.pluginId === configTool.pluginId ? e : item
              )
            };
            setAppForm(newAppForm);
          }}
        />
      )}
    </>
  );
};

export default React.memo(ToolSelect);
