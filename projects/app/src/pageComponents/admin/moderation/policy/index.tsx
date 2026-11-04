'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Button, Flex, Grid, HStack, Switch, Text, useDisclosure } from '@chakra-ui/react';
import SettingPage from '@/pageComponents/admin/settings/SettingPage';
import FirstTitle from '@/pageComponents/admin/settings/FirstTitle';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MySelect from '@fastgpt/web/components/common/MySelect';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  getAdminModerationPluginList,
  getAdminModerationPolicy,
  postAdminDeleteModerationPlugin,
  postAdminUpdateModerationPolicy
} from '@/web/core/plugin/admin/moderation/api';
import {
  ModerationRiskActionEnum,
  ModerationExceptionActionEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import {
  DefaultSystemModerationPolicy,
  type AdminModerationPluginItemType,
  type SystemModerationPolicyType
} from '@fastgpt/global/core/plugin/moderation/type';
import PluginItemRow from './PluginItemRow';
import EditPluginModal from './EditPluginModal';
import ModerationTestCard from './ModerationTestCard';
import dynamic from 'next/dynamic';

const ImportPluginModal = dynamic(() => import('@/pageComponents/admin/config/ImportPluginModal'));

export const ModerationPolicy = () => {
  const router = useRouter();
  const { toast } = useToast();

  const [policy, setPolicy] = useState<SystemModerationPolicyType>(DefaultSystemModerationPolicy);
  const [plugins, setPlugins] = useState<AdminModerationPluginItemType[]>([]);
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const hasInitializedCollapse = useRef(false);

  const [editingPlugin, setEditingPlugin] = useState<AdminModerationPluginItemType | null>(null);

  const { isOpen: isImportOpen, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();

  // 1. 获取全局策略与插件列表
  const { loading: loadingPolicy, runAsync: fetchPolicy } = useRequest(getAdminModerationPolicy, {
    onSuccess: (data) => {
      if (data) {
        setPolicy(data);
        // 标注 2 特殊状态规则：若当前有审核服务在生效，列表默认收起；若未选择，默认展开
        if (!hasInitializedCollapse.current) {
          setIsListCollapsed(Boolean(data.activePluginId));
          hasInitializedCollapse.current = true;
        }
      }
    },
    errorToast: '获取内容审核策略失败',
    manual: false
  });

  const { loading: loadingPlugins, runAsync: fetchPlugins } = useRequest(
    getAdminModerationPluginList,
    {
      onSuccess: (data) => {
        if (data) {
          setPlugins(data);
        }
      },
      errorToast: '获取内容审核插件列表失败',
      manual: false
    }
  );

  // 当前生效服务对象
  const activePlugin = useMemo(() => {
    return plugins.find((p) => p.pluginId === policy.activePluginId);
  }, [plugins, policy.activePluginId]);

  // 保存全局策略配置
  const { runAsync: savePolicy, loading: savingPolicy } = useRequest(
    postAdminUpdateModerationPolicy,
    {
      manual: true,
      successToast: '保存成功',
      errorToast: '保存失败',
      onSuccess: () => {
        void fetchPolicy();
        void fetchPlugins();
      }
    }
  );

  const handleSubmit = () => {
    void savePolicy(policy);
  };

  // 单选切换当前生效服务
  const handleToggleActivePlugin = (pluginId: string) => {
    setPolicy((prev) => ({
      ...prev,
      activePluginId: prev.activePluginId === pluginId ? undefined : pluginId
    }));
  };

  // 删除插件
  const handleDeletePlugin = async (pluginId: string) => {
    try {
      // 若当前删除的插件处于启用生效状态，先在本地更新 activePluginId
      if (policy.activePluginId === pluginId) {
        setPolicy((prev) => ({
          ...prev,
          activePluginId: undefined
        }));
      }

      await postAdminDeleteModerationPlugin({ pluginId });
      toast({
        status: 'success',
        title: '删除成功'
      });
      void fetchPlugins();
    } catch (err: any) {
      toast({
        status: 'error',
        title: err?.message || '删除插件失败'
      });
    }
  };

  const handleAddFromMarket = () => {
    router.push('/config/tool/marketplace?type=moderation');
  };

  // SettingPage 标题列表：审核服务未开启时，下面 3 个板块全部隐藏
  const allTitles = [
    { mainTitle: '审核服务', subTitles: [] },
    { mainTitle: '审核生效环节', subTitles: [] },
    { mainTitle: '处理策略', subTitles: [] },
    { mainTitle: '审核效果测试', subTitles: [] }
  ];

  const visibleTitles = policy.enabled ? allTitles : [allTitles[0]];

  return (
    <>
      <SettingPage
        titles={visibleTitles}
        loading={loadingPolicy || loadingPlugins || savingPolicy}
        onSubmit={handleSubmit}
        maxW={'840px'}
      >
        {/* ================= 1. 审核服务 ================= */}
        <FirstTitle title="审核服务" />

        <Box py={2}>
          <Flex alignItems={'center'} justifyContent={'space-between'} mb={4}>
            <Box>
              <Text fontSize={'md'} fontWeight={'medium'} color={'myGray.900'}>
                是否开启内容审核
              </Text>
            </Box>
            <Switch
              size={'md'}
              isChecked={policy.enabled}
              onChange={(e) => {
                setPolicy((prev) => ({
                  ...prev,
                  enabled: e.target.checked
                }));
              }}
            />
          </Flex>

          {/* 当开启内容审核时展示服务与插件管理列表 */}
          {policy.enabled && (
            <>
              {/* 当前生效服务 & 全部收起/展开 */}
              <Flex
                alignItems={'center'}
                justifyContent={'space-between'}
                mb={3}
                p={3.5}
                borderRadius={'md'}
                bg={'myGray.50'}
              >
                <Flex alignItems={'center'} gap={2}>
                  <Text fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
                    当前生效服务:
                  </Text>
                  <Text
                    fontSize={'sm'}
                    fontWeight={'bold'}
                    color={activePlugin ? 'primary.600' : 'myGray.500'}
                  >
                    {activePlugin?.name || policy.activePluginId || '请先添加审核插件'}
                  </Text>
                </Flex>

                {/* 收起/展开列表按钮 */}
                {plugins.length > 0 && (
                  <Flex
                    alignItems={'center'}
                    gap={1}
                    cursor={'pointer'}
                    color={'myGray.600'}
                    fontSize={'xs'}
                    userSelect={'none'}
                    onClick={() => setIsListCollapsed((prev) => !prev)}
                  >
                    <Text>{isListCollapsed ? '展开列表' : '全部收起'}</Text>
                    <MyIcon
                      name="common/downArrowFill"
                      w={'12px'}
                      transform={isListCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}
                      transition={'transform 0.2s'}
                    />
                  </Flex>
                )}
              </Flex>

              {/* 插件管理列表 (受折叠状态控制) */}
              {!isListCollapsed && (
                <Box mb={2}>
                  {plugins.length === 0 ? (
                    /* 空态提示 */
                    <Box
                      p={8}
                      borderRadius={'md'}
                      border={'1px dashed'}
                      borderColor={'myGray.300'}
                      bg={'myGray.50'}
                      textAlign={'center'}
                    >
                      <Flex
                        w={'44px'}
                        h={'44px'}
                        borderRadius={'full'}
                        bg={'primary.50'}
                        color={'primary.600'}
                        alignItems={'center'}
                        justifyContent={'center'}
                        mx={'auto'}
                        mb={3}
                      >
                        <MyIcon name="common/addLight" w={'22px'} />
                      </Flex>
                      <Text fontSize={'sm'} color={'myGray.600'} fontWeight={'medium'} mb={4}>
                        您还没有审核插件
                      </Text>
                      <HStack spacing={3} justifyContent={'center'}>
                        <Button variant={'whiteBase'} size={'sm'} onClick={handleAddFromMarket}>
                          + 从插件市场添加
                        </Button>
                        <Button variant={'whiteBase'} size={'sm'} onClick={onOpenImport}>
                          + 从本地安装
                        </Button>
                      </HStack>
                    </Box>
                  ) : (
                    /* 插件表格 */
                    <Box
                      borderRadius={'md'}
                      border={'1px solid'}
                      borderColor={'myGray.200'}
                      bg={'white'}
                      overflow={'hidden'}
                    >
                      {/* 表头 (5列) */}
                      <Flex
                        h={'40px'}
                        bg={'myGray.50'}
                        px={4}
                        alignItems={'center'}
                        borderBottom={'1px solid'}
                        borderColor={'myGray.200'}
                        fontSize={'xs'}
                        fontWeight={'medium'}
                        color={'myGray.600'}
                      >
                        <Box w={'40px'} flexShrink={0} />
                        <Box w={'200px'} flexShrink={0} pr={2}>
                          审核插件名称
                        </Box>
                        <Box flex={'1 1 0'} minW={0} pr={4}>
                          描述
                        </Box>
                        <Box w={'80px'} flexShrink={0}>
                          操作
                        </Box>
                        <Box w={'80px'} flexShrink={0}>
                          状态
                        </Box>
                      </Flex>

                      {/* 表格数据行 */}
                      <Box>
                        {plugins.map((plugin) => (
                          <PluginItemRow
                            key={plugin.pluginId}
                            plugin={plugin}
                            isActive={policy.activePluginId === plugin.pluginId}
                            onSelect={() => handleToggleActivePlugin(plugin.pluginId)}
                            onEdit={() => setEditingPlugin(plugin)}
                            onDelete={() => handleDeletePlugin(plugin.pluginId)}
                          />
                        ))}
                      </Box>

                      {/* 列表底部添加/安装操作 */}
                      <Flex
                        justifyContent={'flex-end'}
                        gap={3}
                        p={3.5}
                        bg={'white'}
                        borderTop={'1px solid'}
                        borderColor={'myGray.100'}
                      >
                        <Button variant={'whiteBase'} size={'sm'} onClick={handleAddFromMarket}>
                          + 从插件市场添加
                        </Button>
                        <Button variant={'whiteBase'} size={'sm'} onClick={onOpenImport}>
                          + 从本地安装
                        </Button>
                      </Flex>
                    </Box>
                  )}
                </Box>
              )}
            </>
          )}
        </Box>

        {/* ================= 下方 3 个板块仅在开启内容审核时显示 ================= */}
        {policy.enabled && (
          <>
            {/* ================= 2. 审核生效环节 ================= */}
            <FirstTitle title="审核生效环节" />

            <Box py={3}>
              <Grid templateColumns={['1fr', '1fr 1fr']} gap={4}>
                {/* 用户输入 */}
                <Flex
                  alignItems={'center'}
                  justifyContent={'space-between'}
                  p={4}
                  borderRadius={'md'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                  bg={'white'}
                >
                  <Flex alignItems={'center'} gap={1.5}>
                    <Text fontSize={'md'} fontWeight={'medium'} color={'myGray.900'}>
                      用户输入
                    </Text>
                    <QuestionTip label="开启后，对网页端与 API 传入的本轮用户问题、全局变量和表单输入执行前置安全审查。" />
                  </Flex>
                  <Switch
                    size={'md'}
                    isChecked={policy.hooks.userInput}
                    onChange={(e) => {
                      setPolicy((prev) => ({
                        ...prev,
                        hooks: { ...prev.hooks, userInput: e.target.checked }
                      }));
                    }}
                  />
                </Flex>

                {/* 模型输入 */}
                <Flex
                  alignItems={'center'}
                  justifyContent={'space-between'}
                  p={4}
                  borderRadius={'md'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                  bg={'white'}
                >
                  <Flex alignItems={'center'} gap={1.5}>
                    <Text fontSize={'md'} fontWeight={'medium'} color={'myGray.900'}>
                      模型输入
                    </Text>
                    <QuestionTip label="开启后，对发送给模型的输入内容（提示词、知识库引用切片、文件文本等）执行安全审查（历史消息免审）。" />
                  </Flex>
                  <Switch
                    size={'md'}
                    isChecked={policy.hooks.modelInput}
                    onChange={(e) => {
                      setPolicy((prev) => ({
                        ...prev,
                        hooks: { ...prev.hooks, modelInput: e.target.checked }
                      }));
                    }}
                  />
                </Flex>

                {/* 最终输出 */}
                <Flex
                  alignItems={'center'}
                  justifyContent={'space-between'}
                  p={4}
                  borderRadius={'md'}
                  border={'1px solid'}
                  borderColor={'myGray.200'}
                  bg={'white'}
                >
                  <Flex alignItems={'center'} gap={1.5}>
                    <Text fontSize={'md'} fontWeight={'medium'} color={'myGray.900'}>
                      最终输出
                    </Text>
                    <QuestionTip label="开启后，对平台交付给用户的各类文本输出和流式内容进行安全审查与拦截。" />
                  </Flex>
                  <Switch
                    size={'md'}
                    isChecked={policy.hooks.finalOutput}
                    onChange={(e) => {
                      setPolicy((prev) => ({
                        ...prev,
                        hooks: { ...prev.hooks, finalOutput: e.target.checked }
                      }));
                    }}
                  />
                </Flex>
              </Grid>
            </Box>

            {/* ================= 3. 处理策略 ================= */}
            <FirstTitle title="处理策略" />

            <Box py={3}>
              <Flex flexDirection={'column'} gap={4}>
                {/* 流式审核间隔 */}
                <Box>
                  <Flex alignItems={'center'} gap={1.5} mb={2}>
                    <Text fontSize={'md'} fontWeight={'medium'} color={'myGray.900'}>
                      流式审核间隔
                    </Text>
                    <QuestionTip label="每累计指定字符数先审核再输出。数值越小，等待更短、输出更流畅，但请求量和成本更高；数值越大，成本更低，但等待更长。" />
                  </Flex>
                  <HStack spacing={2}>
                    <MyNumberInput
                      min={1}
                      precision={0}
                      w={'160px'}
                      bg={'white'}
                      value={policy.strategy.streamInterval}
                      onChange={(val) => {
                        setPolicy((prev) => ({
                          ...prev,
                          strategy: {
                            ...prev.strategy,
                            streamInterval:
                              typeof val === 'number' && Number.isFinite(val)
                                ? Math.max(1, Math.trunc(val))
                                : 50
                          }
                        }));
                      }}
                    />
                    <Text fontSize={'sm'} color={'myGray.600'}>
                      字符/次
                    </Text>
                  </HStack>
                </Box>

                {/* 疑似风险 */}
                <Box>
                  <Flex alignItems={'center'} gap={1.5} mb={2}>
                    <Text fontSize={'md'} fontWeight={'medium'} color={'myGray.900'}>
                      疑似风险
                    </Text>
                    <QuestionTip label="判定结果为内容疑似存在风险时的处理方式。" />
                  </Flex>
                  <MySelect
                    width={'100%'}
                    value={policy.strategy.suspectedRiskAction}
                    list={[
                      { label: '放行并记录', value: ModerationRiskActionEnum.passAndLog },
                      { label: '拦截并记录', value: ModerationRiskActionEnum.blockAndLog }
                    ]}
                    onChange={(val) => {
                      setPolicy((prev) => ({
                        ...prev,
                        strategy: {
                          ...prev.strategy,
                          suspectedRiskAction: val
                        }
                      }));
                    }}
                  />
                </Box>

                {/* 服务异常 */}
                <Box>
                  <Flex alignItems={'center'} gap={1.5} mb={2}>
                    <Text fontSize={'md'} fontWeight={'medium'} color={'myGray.900'}>
                      服务异常
                    </Text>
                    <QuestionTip label="审核服务未返回结果时，选择是否允许未审核内容继续流转。" />
                  </Flex>
                  <MySelect
                    width={'100%'}
                    value={policy.strategy.serviceExceptionAction}
                    list={[
                      { label: '放行未审核内容', value: ModerationExceptionActionEnum.pass },
                      {
                        label: '拦截未审核内容',
                        description: '审核服务故障时，应用将不可用，请谨慎选择',
                        value: ModerationExceptionActionEnum.block
                      }
                    ]}
                    onChange={(val) => {
                      setPolicy((prev) => ({
                        ...prev,
                        strategy: {
                          ...prev.strategy,
                          serviceExceptionAction: val
                        }
                      }));
                    }}
                  />
                </Box>
              </Flex>
            </Box>

            {/* ================= 4. 审核效果测试 ================= */}
            <FirstTitle title="审核效果测试" />

            <Box py={2}>
              <ModerationTestCard activePlugin={activePlugin} />
            </Box>
          </>
        )}
      </SettingPage>

      {/* 插件编辑弹窗 */}
      {editingPlugin && (
        <EditPluginModal
          plugin={editingPlugin}
          onClose={() => setEditingPlugin(null)}
          onSuccess={() => {
            void fetchPlugins();
          }}
        />
      )}

      {/* 本地安装插件弹窗 */}
      {isImportOpen && (
        <ImportPluginModal
          onClose={onCloseImport}
          tools={[]}
          onSuccess={() => {
            void fetchPlugins();
          }}
        />
      )}
    </>
  );
};

export default ModerationPolicy;
