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
import { Dropdown } from 'react-day-picker';
import MyIcon from '@fastgpt/web/components/common/Icon';
import AddQuickAppModal from './AddQuickAppModal';
import { listQuickApps } from '@/web/support/user/team/gate/quickApp';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import type { AppListItemType } from '@fastgpt/global/core/app/type';

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
  onStatusChange,
  onSloganChange,
  onPlaceholderChange,
  onAppFormChange
}: Props) => {
  const { t } = useTranslation();
  // 批量获取插件信息
  const [appForm, setAppForm] = useState(getDefaultAppForm());
  // 快捷应用modal状态
  const [isQuickAppModalOpen, setIsQuickAppModalOpen] = useState(false);

  // 获取快捷应用数据
  const {
    data: quickApps = [],
    loading: loadingQuickApps,
    refresh: refreshQuickApps
  } = useRequest2(() => listQuickApps(), {
    manual: false
  });

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

  // 快捷应用相关处理函数
  const handleOpenQuickAppModal = () => {
    setIsQuickAppModalOpen(true);
  };

  const handleCloseQuickAppModal = () => {
    setIsQuickAppModalOpen(false);
  };

  const handleQuickAppSuccess = (selectedApps: any[]) => {
    // 刷新快捷应用列表
    refreshQuickApps();
    console.log('快捷应用更新成功:', selectedApps);
    setIsQuickAppModalOpen(false);
  };

  // 修改 setAppForm，使其同时调用父组件的回调
  const updateAppForm = useCallback(
    (newAppForm: AppSimpleEditFormType) => {
      setAppForm(newAppForm);
      onAppFormChange?.(newAppForm);
    },
    [onAppFormChange]
  );

  // 渲染快捷应用项
  const renderQuickAppItem = (app: AppListItemType, index: number) => {
    const gradients = [
      'linear-gradient(200.75deg, #67BFFF 13.74%, #5BA6FF 89.76%)', // 蓝色渐变
      'linear-gradient(200.75deg, #7895FE 13.74%, #7177FF 89.76%)', // 紫色渐变
      'linear-gradient(200.75deg, #67BFFF 13.74%, #5BA6FF 89.76%)', // 蓝色渐变
      'linear-gradient(200.75deg, #67BFFF 13.74%, #5BA6FF 89.76%)' // 蓝色渐变
    ];

    const gradient = gradients[index % gradients.length];

    return (
      <React.Fragment key={app._id}>
        {/* 应用项 */}
        <Flex
          flexDirection="column"
          alignItems="flex-start"
          padding="4px 0px"
          gap="10px"
          w="80px"
          h="28px"
          borderRadius="6px"
        >
          <Flex alignItems="center" gap="4px" w="80px" h="20px">
            <Box
              w="20px"
              h="20px"
              background={gradient}
              borderRadius="6px"
              position="relative"
              overflow="hidden"
            >
              {app.avatar ? (
                <Avatar src={app.avatar} alt={app.name} w="100%" h="100%" borderRadius="6px" />
              ) : (
                <MyIcon
                  name="core/app/type/simple"
                  position="absolute"
                  left="15%"
                  right="15%"
                  top="15%"
                  bottom="15%"
                  color="white"
                />
              )}
            </Box>
            <Text
              w="56px"
              h="16px"
              fontFamily="PingFang SC"
              fontWeight={400}
              fontSize="12px"
              lineHeight="16px"
              letterSpacing="0.004em"
              color="#111824"
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
            >
              {app.name}
            </Text>
          </Flex>
        </Flex>

        {/* 分隔线 - 除了最后一个应用之外都显示 */}
        {index < Math.min(quickApps.length - 1, 3) && (
          <Box w="11.46px" h="0px" border="1px solid #DFE2EA" transform="rotate(90deg)" />
        )}
      </React.Fragment>
    );
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
        {/* 快捷应用 */}
        <FormControl
          display={'flex'}
          flexDirection={'column'}
          justifyContent={'center'}
          alignItems={'flex-start'}
          gap={'8px'}
        >
          {/* 标题行 */}
          <Flex alignItems={'center'} gap={'4px'}>
            <Text
              color={'var(--Gray-Modern-600, #485264)'}
              fontFamily={'PingFang SC'}
              fontSize={'14px'}
              fontWeight={500}
              lineHeight={'20px'}
              letterSpacing={'0.1px'}
            >
              {t('account_gate:quick_app')}
            </Text>
            <MyIcon name="common/help" w="16px" h="16px" color="#667085" />
          </Flex>

          {/* 下拉框区域 */}
          <Flex alignItems="center" gap="8px" w="640px" h="40px">
            {/* 应用容器 */}
            <Box
              position="relative"
              w="600px"
              h="40px"
              bg="#FBFBFC"
              border="1px solid #E8EBF0"
              borderRadius="8px"
            >
              {/* 应用列表 */}
              <Flex
                position="absolute"
                alignItems="center"
                gap="8px"
                w="560px"
                h="28px"
                left="12px"
                top="calc(50% - 14px)"
              >
                {quickApps.length > 0 ? (
                  quickApps.slice(0, 4).map((app, index) => renderQuickAppItem(app, index))
                ) : (
                  <Text fontSize="12px" color="#667085" fontFamily="PingFang SC">
                    {loadingQuickApps ? '加载中...' : '暂无快捷应用'}
                  </Text>
                )}
              </Flex>
            </Box>

            {/* 设置按钮 */}
            <Flex
              alignItems="center"
              justifyContent="center"
              padding="7px"
              gap="6px"
              w="32px"
              h="32px"
              borderRadius="6px"
              cursor="pointer"
              onClick={handleOpenQuickAppModal}
              _hover={{
                bg: 'myGray.100'
              }}
            >
              <MyIcon name="common/settingLight" w="18px" h="18px" color="#667085" />
            </Flex>
          </Flex>
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

      {/* 快捷应用配置Modal */}
      {isQuickAppModalOpen && (
        <AddQuickAppModal
          isOpen={isQuickAppModalOpen}
          onClose={handleCloseQuickAppModal}
          onSuccess={handleQuickAppSuccess}
        />
      )}
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
