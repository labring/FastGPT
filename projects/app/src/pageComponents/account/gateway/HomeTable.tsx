import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  Box,
  Flex,
  Text,
  Radio,
  RadioGroup,
  Stack,
  Input,
  FormControl,
  FormLabel,
  Link,
  useTheme,
  useBreakpointValue
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useGateStore } from '@/web/support/user/team/gate/useGateStore';
import ToolSelect, { ToolSelectRefType, ToolItemType } from './ToolSelect';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getBatchPlugins } from '@/web/core/app/api/plugin';
import { useToast } from '@fastgpt/web/hooks/useToast';

type Props = {
  tools: string[];
  slogan: string;
  placeholderText: string;
  status: boolean;
};

const HomeTable = ({ tools, slogan, placeholderText, status }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { updateLocalGateConfig } = useGateStore();
  const toolSelectRef = useRef<ToolSelectRefType>(null);
  const [selectedTools, setSelectedTools] = useState<ToolItemType[]>([]);

  // 批量获取插件信息
  const { runAsync: loadBatchPlugins, loading: loadingPlugins } = useRequest2(
    async (pluginIds: string[]) => {
      if (!pluginIds || pluginIds.length === 0) return {};

      return getBatchPlugins(pluginIds);
    },
    {
      manual: true,
      onError: (err) => {
        toast({
          status: 'error',
          title: t('common:common.Load Failed'),
          description: err?.message
        });
      }
    }
  );

  // 初始加载插件信息
  useEffect(() => {
    if (tools?.length > 0) {
      loadBatchPlugins(tools).then((pluginInfoMap) => {
        if (!pluginInfoMap) return;

        // 将插件信息转换为工具项
        const toolItems: ToolItemType[] = tools
          .map((pluginId) => {
            const info = pluginInfoMap[pluginId];
            if (!info) return null;

            return {
              id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              name: info.name,
              pluginId: pluginId,
              avatar: info.avatar,
              intro: info.intro || '',
              inputs: info.inputs || [],
              outputs: info.outputs || [],
              flowNodeType: info.flowNodeType || 'pluginModule',
              version: info.version || 'v1',
              templateType: info.templateType || 'tools'
            };
          })
          .filter(Boolean) as ToolItemType[];

        setSelectedTools(toolItems);
      });
    }
  }, [tools, loadBatchPlugins]);

  // 通用样式变量
  const spacing = {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px'
  };

  const formStyles = {
    fontSize: '14px',
    lineHeight: '20px',
    fontWeight: '500',
    letterSpacing: '0.1px'
  };

  const inputStyles = {
    padding: '10px 12px',
    height: '40px',
    fontSize: '14px',
    lineHeight: '20px',
    letterSpacing: '0.25px'
  };

  // 响应式工具布局

  // 工具选择变更时的处理函数
  const saveToolsToStore = useCallback(() => {
    if (toolSelectRef.current) {
      const selectedTools = toolSelectRef.current.getSelectedTools();
      // 提取所有插件ID并保存到store
      const pluginIds = selectedTools.map((tool) => tool.pluginId).filter(Boolean) as string[];

      // 检查值是否有变化，避免不必要的更新
      if (JSON.stringify(tools) !== JSON.stringify(pluginIds)) {
        updateLocalGateConfig({
          tools: pluginIds
        });
      }
    }
  }, [tools, updateLocalGateConfig]);

  // 监听工具选择变更
  useEffect(() => {
    // 组件挂载后初始保存一次
    saveToolsToStore();
    // 添加 saveToolsToStore 作为依赖项，确保使用最新版本的函数
  }, [saveToolsToStore]);

  // 处理初始工具加载
  useEffect(() => {
    if (toolSelectRef.current && tools?.length) {
      // 这里可以处理初始工具加载逻辑，如有需要
    }
  }, [tools]);

  const handleStatusChange = (val: string) => {
    updateLocalGateConfig({
      status: val === 'enabled'
    });
  };

  const handleSloganChange = (val: string) => {
    updateLocalGateConfig({
      slogan: val
    });
  };

  const handlePlaceholderChange = (val: string) => {
    updateLocalGateConfig({
      placeholderText: val
    });
  };

  return (
    <Box flex="1 0 0" overflow="auto" px={spacing.sm}>
      <Flex
        flexDirection="column"
        alignItems="center"
        gap={spacing.xl}
        maxW="640px"
        mx="auto"
        pb={6}
        pt={{ base: 4, md: 6 }}
      >
        {/* 状态选择 */}
        <FormControl display="flex" flexDirection="column" gap={spacing.sm} w="full">
          <FormLabel
            fontWeight={formStyles.fontWeight}
            fontSize={formStyles.fontSize}
            lineHeight={formStyles.lineHeight}
            letterSpacing={formStyles.letterSpacing}
            color="myGray.700"
            mb="0"
          >
            {t('account_gate:status')}
          </FormLabel>
          <RadioGroup value={status ? 'enabled' : 'disabled'} onChange={handleStatusChange}>
            <Stack direction={{ base: 'column', sm: 'row' }} spacing={spacing.md}>
              <Flex
                alignItems="center"
                p={`${spacing.sm} ${spacing.lg} ${spacing.sm} ${spacing.md}`}
                borderWidth="1px"
                borderColor={status ? 'primary.500' : 'myGray.200'}
                borderRadius="7px"
                bg={status ? 'blue.50' : 'white'}
                transition="all 0.2s ease-in-out"
                _hover={{
                  bg: status ? 'blue.100' : 'myGray.50',
                  borderColor: status ? 'primary.600' : 'myGray.300',
                  boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
                  transform: 'translateY(-1px)'
                }}
              >
                <Radio value="enabled" colorScheme="blue" mr={2}>
                  <Text
                    fontSize={formStyles.fontSize}
                    lineHeight={formStyles.lineHeight}
                    fontWeight={formStyles.fontWeight}
                    letterSpacing={formStyles.letterSpacing}
                  >
                    {t('account_gate:enabled')}
                  </Text>
                </Radio>
              </Flex>
              <Flex
                alignItems="center"
                p={`${spacing.sm} ${spacing.lg} ${spacing.sm} ${spacing.md}`}
                borderWidth="1px"
                borderColor={!status ? 'primary.500' : 'myGray.200'}
                borderRadius="7px"
                bg={!status ? 'blue.50' : 'white'}
                transition="all 0.2s ease-in-out"
                _hover={{
                  bg: !status ? 'blue.100' : 'myGray.50',
                  borderColor: !status ? 'primary.600' : 'myGray.300',
                  boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
                  transform: 'translateY(-1px)'
                }}
              >
                <Radio value="disabled" colorScheme="blue" mr={2}>
                  <Text
                    fontSize={formStyles.fontSize}
                    lineHeight={formStyles.lineHeight}
                    fontWeight={formStyles.fontWeight}
                    letterSpacing={formStyles.letterSpacing}
                  >
                    {t('account_gate:disabled')}
                  </Text>
                </Radio>
              </Flex>
            </Stack>
          </RadioGroup>
        </FormControl>
        {/* slogan设置 */}
        <FormControl display="flex" flexDirection="column" gap={spacing.sm} w="full">
          <Flex alignItems="center" gap={spacing.xs}>
            <Text
              fontWeight={formStyles.fontWeight}
              fontSize={formStyles.fontSize}
              lineHeight={formStyles.lineHeight}
              letterSpacing={formStyles.letterSpacing}
              color="myGray.700"
            >
              {t('account_gate:slogan')}
            </Text>
            <Link
              color="primary.500"
              fontSize={formStyles.fontSize}
              fontWeight={formStyles.fontWeight}
              textDecoration="underline"
            >
              {t('account_gate:example')}
            </Link>
          </Flex>
          <Input
            value={slogan}
            onChange={(e) => handleSloganChange(e.target.value)}
            bg="myGray.50"
            borderWidth="1px"
            borderColor="myGray.200"
            borderRadius="8px"
            p={inputStyles.padding}
            h={inputStyles.height}
            fontSize={inputStyles.fontSize}
            lineHeight={inputStyles.lineHeight}
            letterSpacing={inputStyles.letterSpacing}
            color="gray.900"
          />
        </FormControl>

        {/* 对话提示文字 */}
        <FormControl display="flex" flexDirection="column" gap={spacing.sm} w="full">
          <Flex alignItems="center" gap={spacing.xs}>
            <Text
              fontWeight={formStyles.fontWeight}
              fontSize={formStyles.fontSize}
              lineHeight={formStyles.lineHeight}
              letterSpacing={formStyles.letterSpacing}
              color="myGray.700"
            >
              {t('account_gate:dialog_prompt_text')}
            </Text>
            <Link
              color="primary.500"
              fontSize={formStyles.fontSize}
              fontWeight={formStyles.fontWeight}
              textDecoration="underline"
            >
              {t('account_gate:example')}
            </Link>
          </Flex>
          <Input
            value={placeholderText}
            onChange={(e) => handlePlaceholderChange(e.target.value)}
            bg="myGray.50"
            borderWidth="1px"
            borderColor="myGray.200"
            borderRadius="8px"
            p={inputStyles.padding}
            h={inputStyles.height}
            fontSize={inputStyles.fontSize}
            lineHeight={inputStyles.lineHeight}
            letterSpacing={inputStyles.letterSpacing}
            color="gray.900"
          />
        </FormControl>
        {/* 可用工具选择 */}
        <FormControl display="flex" flexDirection="column" gap={spacing.sm} w="full">
          <ToolSelect
            ref={toolSelectRef}
            key="tool-select"
            defaultTools={selectedTools}
            isLoading={loadingPlugins}
            onChange={saveToolsToStore}
          />
        </FormControl>
        {/* 可用工具 */}
        {/* <FormControl display="flex" flexDirection="column" gap={spacing.sm} w="full">
          <Flex gap={spacing.xs}>
            <FormLabel
              fontWeight={formStyles.fontWeight}
              fontSize={formStyles.fontSize}
              lineHeight={formStyles.lineHeight}
              letterSpacing={formStyles.letterSpacing}
              color="myGray.700"
              mb="0"
            >
              {t('account_gate:available_tools')}
            </FormLabel>
            <QuestionTip />
          </Flex>
          <CheckboxGroup colorScheme="blue" value={tools} onChange={handleToolsChange}>
            <Wrap spacing={toolsSpacing}>
              {[
                { value: 'webSearch', label: t('account_gate:web_search') },
                { value: 'deepThinking', label: t('account_gate:deep_thinking') },
                { value: 'fileUpload', label: t('account_gate:file_upload') },
                { value: 'imageUpload', label: t('account_gate:image_upload') },
                { value: 'voiceInput', label: t('account_gate:voice_input') }
              ].map((item) => (
                <WrapItem key={item.value}>
                  <Flex
                    p={`${spacing.sm} ${spacing.lg} ${spacing.sm} ${spacing.md}`}
                    borderWidth="1px"
                    borderColor={
                      tools.includes(item.value as GateTool) ? 'primary.500' : 'myGray.200'
                    }
                    borderRadius="7px"
                    bg={tools.includes(item.value as GateTool) ? 'blue.50' : 'white'}
                    transition="all 0.2s ease-in-out"
                    _hover={{
                      bg: tools.includes(item.value as GateTool) ? 'blue.100' : 'myGray.50',
                      borderColor: tools.includes(item.value as GateTool)
                        ? 'primary.600'
                        : 'myGray.300',
                      boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.05)',
                      transform: 'translateY(-1px)'
                    }}
                  >
                    <Checkbox
                      value={item.value}
                      colorScheme="blue"
                      isChecked={tools.includes(item.value as GateTool)}
                    >
                      <Text
                        fontSize={formStyles.fontSize}
                        lineHeight={formStyles.lineHeight}
                        fontWeight={formStyles.fontWeight}
                        letterSpacing={formStyles.letterSpacing}
                      >
                        {item.label}
                      </Text>
                    </Checkbox>
                  </Flex>
                </WrapItem>
              ))}
            </Wrap>
          </CheckboxGroup>
        </FormControl> */}
      </Flex>
    </Box>
  );
};

export default HomeTable;

// 导出常量供其他组件使用
export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px'
};

export const formStyles = {
  fontSize: '14px',
  lineHeight: '20px',
  fontWeight: '500',
  letterSpacing: '0.1px'
};
