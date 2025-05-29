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
  Link
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import ToolSelect from './ToolSelect';
import type { putUpdateGateConfigData } from '@fastgpt/global/support/user/team/gate/api';
import { updateTeamGateConfig } from '@/web/support/user/team/gate/api';
import { appWorkflow2Form, getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import type { SimpleAppSnapshotType } from '@/pageComponents/app/detail/SimpleApp/useSnapshots';
import { getAppConfigByDiff } from '@/web/core/app/diff';
import { v1Workflow2V2 } from '@/web/core/workflow/adapt';
import { useMount } from 'ahooks';
import type { AppDetailType, AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { useSimpleAppSnapshots } from '@/pageComponents/app/detail/Gate/useSnapshots';

export const saveGateConfig = async (data: putUpdateGateConfigData) => {
  try {
    await updateTeamGateConfig(data);
  } catch (error) {
    console.error('Failed to save gate config:', error);
  }
};

type Props = {
  appDetail: AppDetailType;
  tools: string[];
  slogan: string;
  placeholderText: string;
  status: boolean;
  onStatusChange?: (status: boolean) => void;
  onSloganChange?: (slogan: string) => void;
  onPlaceholderChange?: (text: string) => void;
  onToolsChange?: (tools: string[]) => void;
  onAppFormChange?: (appForm: AppSimpleEditFormType) => void;
};

const HomeTable = ({
  appDetail,
  slogan,
  placeholderText,
  status,
  onStatusChange,
  onSloganChange,
  onPlaceholderChange,
  onAppFormChange
}: Props) => {
  const { t } = useTranslation();
  // 批量获取插件信息
  const [appForm, setAppForm] = useState(getDefaultAppForm());
  const { forbiddenSaveSnapshot, past, setPast, saveSnapshot } = useSimpleAppSnapshots(
    appDetail._id
  );
  useMount(() => {
    if (appDetail.version !== 'v2') {
      const form = appWorkflow2Form({
        nodes: v1Workflow2V2((appDetail.modules || []) as any)?.nodes,
        chatConfig: appDetail.chatConfig
      });
      return updateAppForm(form);
    }

    // 读取旧的存储记录
    const pastSnapshot = (() => {
      try {
        const pastSnapshot = localStorage.getItem(`${appDetail._id}-past`);
        return pastSnapshot ? (JSON.parse(pastSnapshot) as SimpleAppSnapshotType[]) : [];
      } catch (error) {
        return [];
      }
    })();
    const defaultState = pastSnapshot?.[pastSnapshot.length - 1]?.state;
    if (pastSnapshot?.[0]?.diff && defaultState) {
      setPast(
        pastSnapshot
          .map((item) => {
            if (!item.state && !item.diff) return;
            if (!item.diff) {
              return {
                title: t('app:initial_form'),
                isSaved: true,
                appForm: defaultState
              };
            }

            const currentState = getAppConfigByDiff(defaultState, item.diff);
            return {
              title: item.title,
              isSaved: item.isSaved,
              appForm: currentState
            };
          })
          .filter(Boolean) as SimpleAppSnapshotType[]
      );

      const pastState = getAppConfigByDiff(defaultState, pastSnapshot[0].diff);
      localStorage.removeItem(`${appDetail._id}-past`);
      return updateAppForm(pastState);
    }

    // 无旧的记录，正常初始化
    if (past.length === 0) {
      const appForm = appWorkflow2Form({
        nodes: appDetail.modules,
        chatConfig: appDetail.chatConfig
      });
      saveSnapshot({
        appForm,
        title: t('app:initial_form'),
        isSaved: true
      });
      updateAppForm(appForm);
    } else {
      updateAppForm(past[0].appForm);
    }
  });

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

  const handleStatusChange = (val: string) => {
    onStatusChange?.(val === 'enabled');
  };

  const handleSloganChange = (val: string) => {
    onSloganChange?.(val);
  };

  const handlePlaceholderChange = (val: string) => {
    onPlaceholderChange?.(val);
  };

  // 修改 setAppForm，使其同时调用父组件的回调
  const updateAppForm = useCallback(
    (newAppForm: AppSimpleEditFormType) => {
      setAppForm(newAppForm);
      onAppFormChange?.(newAppForm);
    },
    [onAppFormChange]
  );

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
                <Radio value="enabled" colorScheme="blue">
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
                <Radio value="disabled" colorScheme="blue">
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
        {/* 可用工具选择 */}
        <FormControl display="flex" flexDirection="column" gap={spacing.sm} w="full">
          <ToolSelect
            appForm={appForm}
            setAppForm={updateAppForm} // 使用 updateAppForm 替代 setAppForm
          />
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
