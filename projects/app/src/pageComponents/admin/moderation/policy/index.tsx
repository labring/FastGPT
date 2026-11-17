'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Button, Flex, Grid, HStack, Switch, Text, useDisclosure } from '@chakra-ui/react';
import SettingPage from '@/pageComponents/admin/settings/SettingPage';
import FirstTitle from '@/pageComponents/admin/settings/FirstTitle';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MySelect from '@fastgpt/web/components/common/MySelect';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import {
  getAdminModerationPluginList,
  getAdminModerationPolicy,
  postAdminDeleteModerationPlugin,
  postAdminSaveModerationConfig,
  postAdminUpdateModerationPolicy
} from '@/web/core/plugin/admin/moderation/api';
import {
  DEFAULT_MODERATION_STREAM_INTERVAL,
  ModerationRiskActionEnum,
  ModerationExceptionActionEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import {
  DefaultSystemModerationPolicy,
  type AdminModerationPluginItemType,
  type SystemModerationPolicyType
} from '@fastgpt/global/core/plugin/moderation/type';
import { useModerationPolicyDraftStore } from '@/web/core/plugin/admin/moderation/policyDraft';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { getErrText } from '@fastgpt/global/common/error/utils';
import PluginItemRow from './PluginItemRow';
import EditPluginModal from './EditPluginModal';
import ModerationTestCard from './ModerationTestCard';
import dynamic from 'next/dynamic';

const ImportPluginModal = dynamic(() => import('@/pageComponents/admin/config/ImportPluginModal'));

export const ModerationPolicy = () => {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useSafeTranslation();

  const [policy, setPolicy] = useState<SystemModerationPolicyType>(DefaultSystemModerationPolicy);
  const policyRef = useRef<SystemModerationPolicyType>(DefaultSystemModerationPolicy);
  const draftRevisionRef = useRef(0);
  const [plugins, setPlugins] = useState<AdminModerationPluginItemType[]>([]);
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const hasInitializedCollapse = useRef(false);
  const marketplaceDraft = useRef(useModerationPolicyDraftStore.getState().draft);

  const [editingPlugin, setEditingPlugin] = useState<AdminModerationPluginItemType | null>(null);
  const [activatingPluginId, setActivatingPluginId] = useState<string | null>(null);
  const persistedPolicyRef = useRef<SystemModerationPolicyType | null>(null);

  const { isOpen: isImportOpen, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();
  const [uninstallingLastPlugin, setUninstallingLastPlugin] = useState(false);
  const { openConfirm: openUninstallLastConfirm, ConfirmModal: UninstallLastPluginModal } =
    useConfirm({
      type: 'delete'
    });

  /**
   * 同步更新 policy 状态与最新草稿 ref，避免异步回调读取到过期闭包或覆盖请求期间的编辑。
   */
  const updatePolicy = (
    updater:
      | SystemModerationPolicyType
      | ((prev: SystemModerationPolicyType) => SystemModerationPolicyType),
    options?: { markDraftDirty?: boolean }
  ) => {
    if (options?.markDraftDirty !== false) {
      draftRevisionRef.current += 1;
    }
    const next = typeof updater === 'function' ? updater(policyRef.current) : updater;
    policyRef.current = next;
    setPolicy(next);
    return next;
  };

  // 1. 获取全局策略与插件列表
  const { loading: loadingPolicy, runAsync: fetchPolicy } = useRequest(getAdminModerationPolicy, {
    onSuccess: (data) => {
      if (data) {
        persistedPolicyRef.current = data;
        const restoredPolicy = marketplaceDraft.current ?? data;
        updatePolicy(restoredPolicy, { markDraftDirty: false });
        marketplaceDraft.current = undefined;
        useModerationPolicyDraftStore.getState().setDraft(undefined);
        // 标注 2 特殊状态规则：若当前有审核服务在生效，列表默认收起；若未选择，默认展开
        if (!hasInitializedCollapse.current) {
          setIsListCollapsed(Boolean(restoredPolicy.activePluginId));
          hasInitializedCollapse.current = true;
        }
      }
    },
    errorToast: t('admin:moderation.fetch_policy_error'),
    manual: false
  });

  const { loading: loadingPlugins, runAsync: fetchPlugins } = useRequest(
    () => getAdminModerationPluginList(),
    {
      onSuccess: (data) => {
        if (data) {
          setPlugins(data);
        }
      },
      errorToast: t('admin:moderation.fetch_plugins_error'),
      manual: false
    }
  );

  // 当前生效服务对象
  const activePlugin = useMemo(() => {
    return plugins.find((p) => !p.deleted && p.pluginId === policy.activePluginId);
  }, [plugins, policy.activePluginId]);

  // 保存全局策略配置
  const { runAsync: savePolicy, loading: savingPolicy } = useRequest(
    postAdminUpdateModerationPolicy,
    {
      manual: true,
      successToast: t('admin:moderation.save_success'),
      errorToast: t('admin:moderation.save_error'),
      onSuccess: () => {
        void fetchPolicy();
        void fetchPlugins();
      }
    }
  );

  const handleSubmit = () => {
    const currentPolicy = policyRef.current;
    if (currentPolicy.enabled && !activePlugin) {
      toast({ status: 'error', title: t('admin:moderation.select_plugin_required') });
      return;
    }
    void savePolicy(currentPolicy);
  };

  /**
   * 同步已启用插件到全局策略：
   * 若用户已在页面打开“是否开启内容审核”但尚未点击右侧“保存”，
   * 自动启用或手动点击启用时同步持久化最新草稿中的开关状态，避免刷新或离开页面后丢失开启状态，
   * 同时避免异步请求返回后覆盖等待期间的新增编辑。
   */
  const syncActivePluginPolicy = async (activePluginId: string) => {
    // 1. 从最新草稿 ref 合并本次确认生效的插件 ID，保留等待期间的其他字段修改
    const nextPolicy = updatePolicy(
      (prev) => ({
        ...prev,
        activePluginId
      }),
      { markDraftDirty: false }
    );

    // 2. 仅当最新草稿仍处于开启状态且尚未持久化开启时，提交策略持久化并防止响应覆盖更晚编辑
    if (nextPolicy.enabled && !persistedPolicyRef.current?.enabled) {
      const revisionAtSubmit = draftRevisionRef.current;
      const updated = await postAdminUpdateModerationPolicy(nextPolicy);
      persistedPolicyRef.current = updated ?? nextPolicy;
      if (updated && draftRevisionRef.current === revisionAtSubmit) {
        updatePolicy(updated, { markDraftDirty: false });
      }
      return;
    }

    if (persistedPolicyRef.current) {
      persistedPolicyRef.current = {
        ...persistedPolicyRef.current,
        activePluginId
      };
    }
  };

  // 点击操作栏“启用”按钮切换到目标插件（已启用插件不可取消启用）
  const handleActivatePlugin = async (plugin: AdminModerationPluginItemType) => {
    if (
      !plugin.hasConfiguredSecrets ||
      policyRef.current.activePluginId === plugin.pluginId ||
      activatingPluginId
    ) {
      return;
    }

    setActivatingPluginId(plugin.pluginId);
    try {
      const savedPlugin = await postAdminSaveModerationConfig({
        pluginId: plugin.pluginId,
        enabled: true
      });
      await syncActivePluginPolicy(savedPlugin?.pluginId ?? plugin.pluginId);
      await fetchPlugins();
    } catch (err: any) {
      toast({
        status: 'error',
        title: err?.message || t('admin:moderation.save_error')
      });
    } finally {
      setActivatingPluginId(null);
    }
  };

  // 首个插件配置完成时后端会默认自动启用，前端同步更新生效服务并刷新列表
  const handlePluginConfigSuccess = async (savedPlugin?: AdminModerationPluginItemType) => {
    if (savedPlugin?.enabled && !policyRef.current.activePluginId) {
      try {
        await syncActivePluginPolicy(savedPlugin.pluginId);
      } catch (err: any) {
        toast({
          status: 'error',
          title: err?.message || t('admin:moderation.save_error')
        });
      }
    }
    await fetchPlugins();
  };

  // 执行删除插件请求
  const executeDeletePlugin = async ({
    plugin,
    isLastPlugin
  }: {
    plugin: AdminModerationPluginItemType;
    isLastPlugin: boolean;
  }) => {
    try {
      if (isLastPlugin) setUninstallingLastPlugin(true);
      await postAdminDeleteModerationPlugin({
        pluginId: plugin.pluginId,
        source: plugin.source
      });
      if (isLastPlugin) {
        updatePolicy((prev) => ({
          ...prev,
          enabled: false,
          activePluginId: undefined
        }));
        setIsListCollapsed(false);
        useModerationPolicyDraftStore.getState().setDraft(undefined);
      } else if (policyRef.current.activePluginId === plugin.pluginId) {
        updatePolicy((prev) => ({ ...prev, activePluginId: undefined }));
      }
      toast({
        status: 'success',
        title: t('admin:moderation.uninstall_success')
      });
      await Promise.all([fetchPolicy(), fetchPlugins()]);
    } catch (err: any) {
      const errText = getErrText(err);
      const errorTitle =
        errText === PluginErrEnum.disableModerationBeforeDelete ||
        errText === 'admin:moderation.disable_before_delete'
          ? t('admin:moderation.disable_before_delete')
          : errText || t('admin:moderation.delete_plugin_error');
      toast({
        status: 'error',
        title: errorTitle
      });
    } finally {
      if (isLastPlugin) setUninstallingLastPlugin(false);
    }
  };

  // 删除插件入口：仅剩最后一个审核插件时弹出专用 Modal 提示并允许直接卸载及关闭总开关
  const handleDeletePlugin = (plugin: AdminModerationPluginItemType) => {
    const isLastPlugin = plugins.length <= 1;
    if (isLastPlugin) {
      openUninstallLastConfirm({
        title: t('admin:moderation.uninstall_last_plugin_title'),
        customContent: t('admin:moderation.confirm_uninstall_last_plugin'),
        confirmText: t('admin:moderation.uninstall_plugin'),
        onConfirm: () => executeDeletePlugin({ plugin, isLastPlugin: true })
      })();
      return;
    }

    if (plugin.enabled || (policy.enabled && policy.activePluginId === plugin.pluginId)) {
      toast({
        status: 'warning',
        title: t('admin:moderation.disable_before_delete')
      });
      return;
    }

    void executeDeletePlugin({ plugin, isLastPlugin: false });
  };

  /** Preserve all unsaved fields while visiting the marketplace to install a plugin. */
  const handleAddFromMarket = () => {
    useModerationPolicyDraftStore.getState().setDraft(policyRef.current);
    void router.push('/config/tool/marketplace?type=moderation');
  };

  const showTestSection = policy.enabled && activePlugin !== undefined;

  // SettingPage right-side anchor list: hide lower sections when moderation is disabled,
  // and omit the test section until an active moderation service is selected.
  const visibleTitles = (() => {
    const serviceTitle = { mainTitle: t('admin:moderation.service_title'), subTitles: [] };
    if (!policy.enabled) return [serviceTitle];

    return [
      serviceTitle,
      { mainTitle: t('admin:moderation.hooks_title'), subTitles: [] },
      { mainTitle: t('admin:moderation.strategy_title'), subTitles: [] },
      ...(showTestSection ? [{ mainTitle: t('admin:moderation.test_title'), subTitles: [] }] : [])
    ];
  })();

  return (
    <>
      <SettingPage
        titles={visibleTitles}
        loading={loadingPolicy || loadingPlugins || savingPolicy}
        onSubmit={handleSubmit}
      >
        {/* ================= 1. 审核服务 ================= */}
        <FirstTitle title={t('admin:moderation.service_title')} />

        <Box>
          <Flex alignItems={'center'} minH={'32px'}>
            <Box w={'240px'} maxW={'calc(100% - 36px)'}>
              <Text fontSize={'md'} fontWeight={'medium'} color={'myGray.900'}>
                {t('admin:moderation.enable_moderation')}
              </Text>
            </Box>
            <Switch
              size={'md'}
              isChecked={policy.enabled}
              onChange={(e) => {
                updatePolicy((prev) => ({
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
              <Flex alignItems={'center'} justifyContent={'space-between'} mt={4} minH={'32px'}>
                <Flex alignItems={'center'} gap={2}>
                  <Text fontSize={'md'} fontWeight={'medium'} color={'myGray.900'}>
                    {t('admin:moderation.active_service')}
                  </Text>
                  <Text fontSize={'md'} color={'myGray.600'}>
                    {activePlugin?.name ||
                      policy.activePluginId ||
                      t('admin:moderation.please_add_plugin')}
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
                    <MyIcon
                      name="core/chat/chevronDown"
                      w={'24px'}
                      aria-label={
                        isListCollapsed
                          ? t('admin:moderation.expand_list')
                          : t('admin:moderation.collapse_all')
                      }
                      transform={isListCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'}
                      transition={'transform 0.2s'}
                    />
                  </Flex>
                )}
              </Flex>

              {/* 插件管理列表 (受折叠状态控制) */}
              {!isListCollapsed && (
                <Box mt={5}>
                  {plugins.length === 0 ? (
                    /* 空态提示 */
                    <Box
                      py={'26px'}
                      px={4}
                      borderRadius={'md'}
                      border={'1px solid'}
                      borderColor={'myGray.200'}
                      textAlign={'center'}
                    >
                      <Box w={'80px'} h={'80px'} mx={'auto'} borderRadius={'full'} bg={'myGray.50'}>
                        <MyIcon
                          name="empty"
                          w={'80px'}
                          h={'80px'}
                          color={'transparent'}
                          sx={{ '& circle': { display: 'none' } }}
                        />
                      </Box>
                      <Text fontSize={'sm'} color={'myGray.500'} mt={4} mb={4}>
                        {t('admin:moderation.empty_plugins')}
                      </Text>
                      <HStack spacing={3} justifyContent={'center'}>
                        <Button
                          variant={'whiteBase'}
                          size={'md'}
                          h={'36px'}
                          leftIcon={<MyIcon name="common/addLight" w={'16px'} />}
                          onClick={handleAddFromMarket}
                        >
                          {t('admin:moderation.add_from_marketplace')}
                        </Button>
                        <Button
                          variant={'whiteBase'}
                          size={'md'}
                          h={'36px'}
                          leftIcon={<MyIcon name="common/addLight" w={'16px'} />}
                          onClick={onOpenImport}
                        >
                          {t('admin:moderation.install_from_local')}
                        </Button>
                      </HStack>
                    </Box>
                  ) : (
                    /* 插件表格 */
                    <>
                      <Box
                        borderRadius={'md'}
                        border={'1px solid'}
                        borderColor={'myGray.200'}
                        bg={'white'}
                        overflow={'hidden'}
                      >
                        {/* 表头 (4列) */}
                        <Flex
                          h={'40px'}
                          bg={'myGray.50'}
                          alignItems={'center'}
                          borderBottom={'1px solid'}
                          borderColor={'myGray.200'}
                          fontSize={'xs'}
                          fontWeight={'medium'}
                          color={'myGray.600'}
                        >
                          <Box w={'180px'} flexShrink={0} px={6}>
                            {t('admin:moderation.table_plugin_name')}
                          </Box>
                          <Box flex={'1 1 0'} minW={0} px={6}>
                            {t('admin:moderation.table_description')}
                          </Box>
                          <Box w={'100px'} flexShrink={0} px={6}>
                            {t('admin:moderation.table_status')}
                          </Box>
                          <Box w={'180px'} flexShrink={0} px={6} textAlign={'right'}>
                            {t('admin:moderation.table_actions')}
                          </Box>
                        </Flex>

                        {/* 表格数据行 */}
                        <Box>
                          {plugins.map((plugin) => (
                            <PluginItemRow
                              key={plugin.pluginId}
                              plugin={plugin}
                              isActive={policy.activePluginId === plugin.pluginId}
                              isModerationEnabled={policy.enabled}
                              isLastPlugin={plugins.length <= 1}
                              isActivating={activatingPluginId === plugin.pluginId}
                              onActivate={() => void handleActivatePlugin(plugin)}
                              onEdit={() => setEditingPlugin(plugin)}
                              onDelete={() => handleDeletePlugin(plugin)}
                            />
                          ))}
                        </Box>
                      </Box>
                      {/* 列表底部添加/安装操作 */}
                      <Flex justifyContent={'flex-end'} gap={3} pt={4} bg={'white'}>
                        <Button
                          variant={'whiteBase'}
                          size={'md'}
                          h={'36px'}
                          leftIcon={<MyIcon name="common/addLight" w={'16px'} />}
                          onClick={handleAddFromMarket}
                        >
                          {t('admin:moderation.add_from_marketplace')}
                        </Button>
                        <Button
                          variant={'whiteBase'}
                          size={'md'}
                          h={'36px'}
                          leftIcon={<MyIcon name="common/addLight" w={'16px'} />}
                          onClick={onOpenImport}
                        >
                          {t('admin:moderation.install_from_local')}
                        </Button>
                      </Flex>
                    </>
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
            <FirstTitle title={t('admin:moderation.hooks_title')} />

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
                      {t('admin:moderation.hook_user_input')}
                    </Text>
                    <QuestionTip label={t('admin:moderation.hook_user_input_tip')} />
                  </Flex>
                  <Switch
                    size={'md'}
                    isChecked={policy.hooks.userInput}
                    onChange={(e) => {
                      updatePolicy((prev) => ({
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
                      {t('admin:moderation.hook_model_input')}
                    </Text>
                    <QuestionTip label={t('admin:moderation.hook_model_input_tip')} />
                  </Flex>
                  <Switch
                    size={'md'}
                    isChecked={policy.hooks.modelInput}
                    onChange={(e) => {
                      updatePolicy((prev) => ({
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
                      {t('admin:moderation.hook_final_output')}
                    </Text>
                    <QuestionTip label={t('admin:moderation.hook_final_output_tip')} />
                  </Flex>
                  <Switch
                    size={'md'}
                    isChecked={policy.hooks.finalOutput}
                    onChange={(e) => {
                      updatePolicy((prev) => ({
                        ...prev,
                        hooks: { ...prev.hooks, finalOutput: e.target.checked }
                      }));
                    }}
                  />
                </Flex>
              </Grid>
            </Box>

            {/* ================= 3. 处理策略 ================= */}
            <FirstTitle title={t('admin:moderation.strategy_title')} />

            <Box py={3}>
              <Flex flexDirection={'column'} gap={4}>
                {/* 流式审核间隔 */}
                <Box>
                  <Flex alignItems={'center'} gap={1.5} mb={2}>
                    <Text fontSize={'md'} fontWeight={'medium'} color={'myGray.900'}>
                      {t('admin:moderation.stream_interval')}
                    </Text>
                    <QuestionTip label={t('admin:moderation.stream_interval_tip')} />
                  </Flex>
                  <HStack spacing={2}>
                    <MyNumberInput
                      min={1}
                      precision={0}
                      w={'160px'}
                      variant={'whiteOutline'}
                      value={policy.strategy.streamInterval}
                      onChange={(val) => {
                        updatePolicy((prev) => ({
                          ...prev,
                          strategy: {
                            ...prev.strategy,
                            streamInterval:
                              typeof val === 'number' && Number.isFinite(val)
                                ? Math.max(1, Math.trunc(val))
                                : DEFAULT_MODERATION_STREAM_INTERVAL
                          }
                        }));
                      }}
                    />
                    <Text fontSize={'sm'} color={'myGray.600'}>
                      {t('admin:moderation.chars_per_check')}
                    </Text>
                  </HStack>
                </Box>

                {/* 疑似风险 */}
                <Box>
                  <Flex alignItems={'center'} gap={1.5} mb={2}>
                    <Text fontSize={'md'} fontWeight={'medium'} color={'myGray.900'}>
                      {t('admin:moderation.suspected_risk')}
                    </Text>
                    <QuestionTip label={t('admin:moderation.suspected_risk_tip')} />
                  </Flex>
                  <MySelect
                    width={'100%'}
                    value={policy.strategy.suspectedRiskAction}
                    list={[
                      {
                        label: t('admin:moderation.risk_pass_and_log'),
                        value: ModerationRiskActionEnum.passAndLog
                      },
                      {
                        label: t('admin:moderation.risk_block_and_log'),
                        value: ModerationRiskActionEnum.blockAndLog
                      }
                    ]}
                    onChange={(val) => {
                      updatePolicy((prev) => ({
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
                      {t('admin:moderation.service_exception')}
                    </Text>
                    <QuestionTip label={t('admin:moderation.service_exception_tip')} />
                  </Flex>
                  <MySelect
                    width={'100%'}
                    value={policy.strategy.serviceExceptionAction}
                    list={[
                      {
                        label: t('admin:moderation.exception_pass'),
                        value: ModerationExceptionActionEnum.pass
                      },
                      {
                        label: t('admin:moderation.exception_block'),
                        description: t('admin:moderation.exception_block_desc'),
                        value: ModerationExceptionActionEnum.block
                      }
                    ]}
                    onChange={(val) => {
                      updatePolicy((prev) => ({
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
            {activePlugin !== undefined && (
              <>
                <FirstTitle title={t('admin:moderation.test_title')} />

                <Box>
                  <ModerationTestCard activePlugin={activePlugin} />
                </Box>
              </>
            )}
          </>
        )}
      </SettingPage>

      {/* 插件编辑弹窗 */}
      {editingPlugin && (
        <EditPluginModal
          plugin={editingPlugin}
          onClose={() => setEditingPlugin(null)}
          onSuccess={(savedPlugin) => {
            void handlePluginConfigSuccess(savedPlugin);
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

      {/* 卸载最后一个审核插件确认弹窗 */}
      <UninstallLastPluginModal isLoading={uninstallingLastPlugin} />
    </>
  );
};

export default ModerationPolicy;
