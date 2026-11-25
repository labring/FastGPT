'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isEqual } from 'lodash-es';
import { useRouter } from 'next/router';
import { Box, Button, Flex, HStack, SimpleGrid, Text, useDisclosure } from '@chakra-ui/react';
import AdminSettingPage from '@/pageComponents/admin/settings/AdminSettingPage';
import AdminSettingSection from '@/pageComponents/admin/settings/AdminSettingSection';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import AdminSwitchRow from '@/pageComponents/admin/settings/AdminSwitchRow';
import type { SettingTOCItem } from '@/pageComponents/admin/settings/AdminSettingTOC';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MySelect from '@fastgpt/web/components/common/MySelect';
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
  const syncedRevisionRef = useRef(0);
  const [plugins, setPlugins] = useState<AdminModerationPluginItemType[]>([]);
  const pluginsRef = useRef<AdminModerationPluginItemType[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const hasInitializedCollapse = useRef(false);
  const marketplaceDraft = useRef(useModerationPolicyDraftStore.getState().draft);

  const [editingPlugin, setEditingPlugin] = useState<AdminModerationPluginItemType | null>(null);
  const [activatingPluginId, setActivatingPluginId] = useState<string | null>(null);
  const activatingPluginRef = useRef<string | null>(null);
  const savingPolicyRef = useRef(false);
  const [deletingPlugin, setDeletingPlugin] = useState(false);
  const deletingPluginRef = useRef(false);
  const persistedPolicyRef = useRef<SystemModerationPolicyType | null>(null);
  const [persistedPolicy, setPersistedPolicy] = useState<SystemModerationPolicyType | null>(null);
  const setPersistedPolicyState = (next: SystemModerationPolicyType | null) => {
    persistedPolicyRef.current = next;
    setPersistedPolicy(next);
  };
  const operationQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const { isOpen: isImportOpen, onOpen: onOpenImport, onClose: onCloseImport } = useDisclosure();
  const [uninstallingLastPlugin, setUninstallingLastPlugin] = useState(false);
  const { openConfirm: openUninstallLastConfirm, ConfirmModal: UninstallLastPluginModal } =
    useConfirm({
      type: 'delete'
    });

  /**
   * 统一串行化页面内的策略保存、插件写入与对应回读：
   * 1. 避免策略保存与插件启用/编辑/卸载并发写入产生状态竞态；
   * 2. 避免并发触发同一个 ahooks useRequest.runAsync 导致前序 Promise 永久 pending 而锁死页面。
   */
  const enqueuePageOperation = <T,>(task: () => Promise<T>): Promise<T> => {
    const run = operationQueueRef.current.then(task, task);
    // 队列尾仅传递完成信号，避免单次失败阻断后续排队操作
    operationQueueRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };

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

  // 1. 获取全局策略与插件列表（全部纳入页面串行队列，避免首屏拉取与后续操作重叠触发同一 useRequest）
  const { loading: loadingPolicy, runAsync: fetchPolicy } = useRequest(
    async (expectedRevision?: number) => {
      const revisionAtStart =
        typeof expectedRevision === 'number' ? expectedRevision : draftRevisionRef.current;
      const data = await getAdminModerationPolicy();
      return { data, revisionAtStart };
    },
    {
      onSuccess: ({ data, revisionAtStart }) => {
        if (data) {
          setPersistedPolicyState(data);
          // 仅在请求期间未产生新草稿编辑时覆盖表单状态，防止异步回读冲掉更新的草稿
          if (draftRevisionRef.current === revisionAtStart) {
            const hasMarketplaceDraft = Boolean(marketplaceDraft.current);
            const restoredPolicy = marketplaceDraft.current ?? data;
            // 从插件市场恢复的草稿尚未持久化到服务端，标记为已修改避免后续删除未启用插件时被服务端策略冲掉
            updatePolicy(restoredPolicy, { markDraftDirty: hasMarketplaceDraft });
            if (!hasMarketplaceDraft) {
              syncedRevisionRef.current = draftRevisionRef.current;
            }
            marketplaceDraft.current = undefined;
            useModerationPolicyDraftStore.getState().setDraft(undefined);
            // 标注 2 特殊状态规则：若当前有审核服务在生效，列表默认收起；若未选择，默认展开
            if (!hasInitializedCollapse.current) {
              setIsListCollapsed(Boolean(restoredPolicy.activePluginId));
              hasInitializedCollapse.current = true;
            }
          }
        }
      },
      errorToast: t('admin:moderation.fetch_policy_error'),
      manual: true
    }
  );

  const { loading: loadingPlugins, runAsync: fetchPlugins } = useRequest(
    () => getAdminModerationPluginList(),
    {
      onSuccess: (data) => {
        if (data) {
          pluginsRef.current = data;
          setPlugins(data);
        }
      },
      errorToast: t('admin:moderation.fetch_plugins_error'),
      manual: true
    }
  );

  useEffect(() => {
    let cancelled = false;
    void enqueuePageOperation(async () => {
      if (cancelled) return;
      try {
        await Promise.allSettled([fetchPolicy(syncedRevisionRef.current), fetchPlugins()]);
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    });
    return () => {
      // 卸载/StrictMode 重挂载时重置队列尾，避免被 ahooks 取消的挂起 Promise 阻塞后续挂载
      cancelled = true;
      operationQueueRef.current = Promise.resolve();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当前生效服务对象
  const activePlugin = useMemo(() => {
    return plugins.find((p) => !p.deleted && p.pluginId === policy.activePluginId);
  }, [plugins, policy.activePluginId]);

  // 保存全局策略配置：通过页面级串行队列统一调度保存与回读，避免与插件写入/回读重叠
  const { runAsync: savePolicy, loading: savingPolicy } = useRequest(
    async () =>
      enqueuePageOperation(async () => {
        // 在轮到保存执行时再读取最新草稿与插件列表，避免提交排队前的过期 activePluginId
        const currentPolicy = policyRef.current;
        const currentActivePlugin = pluginsRef.current.find(
          (p) => !p.deleted && p.pluginId === currentPolicy.activePluginId
        );
        if (currentPolicy.enabled && !currentActivePlugin) {
          toast({ status: 'error', title: t('admin:moderation.select_plugin_required') });
          return;
        }

        const revisionAtSubmit = draftRevisionRef.current;
        const updated = await postAdminUpdateModerationPolicy(currentPolicy);
        setPersistedPolicyState(updated ?? currentPolicy);
        syncedRevisionRef.current = revisionAtSubmit;
        // 使用 allSettled 避免回读失败覆盖“保存成功”状态，回读错误由各自请求提示
        await Promise.allSettled([fetchPolicy(revisionAtSubmit), fetchPlugins()]);
        toast({
          status: 'success',
          title: t('admin:moderation.save_success')
        });
        return updated;
      }),
    {
      manual: true,
      errorToast: t('admin:moderation.save_error')
    }
  );

  const isPolicyBusy =
    initializing || loadingPolicy || loadingPlugins || savingPolicy || deletingPlugin;

  const handleSubmit = async () => {
    if (isPolicyBusy || savingPolicyRef.current) return;
    savingPolicyRef.current = true;
    try {
      await savePolicy();
    } finally {
      savingPolicyRef.current = false;
    }
  };

  /**
   * 同步已启用插件到全局策略：
   * 若用户已在页面打开“是否开启内容审核”但尚未点击右上角“保存”，
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
      setPersistedPolicyState(updated ?? nextPolicy);
      syncedRevisionRef.current = revisionAtSubmit;
      if (updated && draftRevisionRef.current === revisionAtSubmit) {
        updatePolicy(updated, { markDraftDirty: false });
      }
      return;
    }

    if (persistedPolicyRef.current) {
      setPersistedPolicyState({
        ...persistedPolicyRef.current,
        activePluginId
      });
    }
  };

  // 点击操作栏“启用”按钮切换到目标插件（已启用插件不可取消启用）
  const handleActivatePlugin = async (plugin: AdminModerationPluginItemType) => {
    if (
      isPolicyBusy ||
      !plugin.hasConfiguredSecrets ||
      policyRef.current.activePluginId === plugin.pluginId ||
      activatingPluginRef.current
    ) {
      return;
    }

    activatingPluginRef.current = plugin.pluginId;
    setActivatingPluginId(plugin.pluginId);
    try {
      await enqueuePageOperation(async () => {
        const currentPlugin = pluginsRef.current.find((item) => item.pluginId === plugin.pluginId);
        if (
          !currentPlugin?.hasConfiguredSecrets ||
          policyRef.current.activePluginId === currentPlugin.pluginId
        ) {
          return;
        }
        const savedPlugin = await postAdminSaveModerationConfig({
          pluginId: currentPlugin.pluginId,
          enabled: true
        });
        await syncActivePluginPolicy(savedPlugin?.pluginId ?? currentPlugin.pluginId);
        // 回读错误由 fetchPlugins 自身提示，不覆盖已完成的插件启用状态
        await Promise.allSettled([fetchPlugins()]);
      });
    } catch (err: any) {
      toast({
        status: 'error',
        title: err?.message || t('admin:moderation.save_error')
      });
    } finally {
      activatingPluginRef.current = null;
      setActivatingPluginId(null);
    }
  };

  // 首个插件配置完成时后端会默认自动启用，前端同步更新生效服务并刷新列表
  const handlePluginConfigSuccess = async (savedPlugin?: AdminModerationPluginItemType) => {
    await enqueuePageOperation(async () => {
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
      await Promise.allSettled([fetchPlugins()]);
    });
  };

  // 执行删除插件请求
  const executeDeletePlugin = async ({
    plugin,
    isLastPlugin
  }: {
    plugin: AdminModerationPluginItemType;
    isLastPlugin: boolean;
  }) => {
    if (deletingPluginRef.current) return;
    deletingPluginRef.current = true;
    setDeletingPlugin(true);
    if (isLastPlugin) setUninstallingLastPlugin(true);
    try {
      await enqueuePageOperation(async () => {
        const currentPlugins = pluginsRef.current;
        const currentPlugin = currentPlugins.find((item) => item.pluginId === plugin.pluginId);
        if (!currentPlugin) return;
        const isActuallyLastPlugin = currentPlugins.length <= 1;
        if (
          !isActuallyLastPlugin &&
          (currentPlugin.enabled ||
            (policyRef.current.enabled &&
              policyRef.current.activePluginId === currentPlugin.pluginId))
        ) {
          toast({
            status: 'warning',
            title: t('admin:moderation.disable_before_delete')
          });
          return;
        }

        await postAdminDeleteModerationPlugin({
          pluginId: currentPlugin.pluginId,
          source: currentPlugin.source
        });
        if (isActuallyLastPlugin) {
          updatePolicy(
            (prev) => ({
              ...prev,
              enabled: false,
              activePluginId: undefined
            }),
            { markDraftDirty: false }
          );
          setIsListCollapsed(false);
          useModerationPolicyDraftStore.getState().setDraft(undefined);
        } else if (policyRef.current.activePluginId === currentPlugin.pluginId) {
          updatePolicy((prev) => ({ ...prev, activePluginId: undefined }), {
            markDraftDirty: false
          });
        }
        toast({
          status: 'success',
          title: t('admin:moderation.uninstall_success')
        });
        // 仅在不存在未保存草稿编辑时用服务端策略覆盖表单，避免删除未启用插件时冲掉本地草稿
        await Promise.allSettled([fetchPolicy(syncedRevisionRef.current), fetchPlugins()]);
      });
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
      deletingPluginRef.current = false;
      setDeletingPlugin(false);
      if (isLastPlugin) setUninstallingLastPlugin(false);
    }
  };

  // 删除插件入口：仅剩最后一个审核插件时弹出专用 Modal 提示并允许直接卸载及关闭总开关
  const handleDeletePlugin = (plugin: AdminModerationPluginItemType) => {
    if (isPolicyBusy || activatingPluginRef.current) return;
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
    if (isPolicyBusy) return;
    useModerationPolicyDraftStore.getState().setDraft(policyRef.current);
    void router.push('/config/tool/marketplace?type=moderation');
  };

  const showTestSection = policy.enabled && activePlugin !== undefined;

  // AdminSettingPage 右侧 TOC 目录：未开启内容审核时隐藏下方大区，未启用审核服务时隐藏测试大区。
  const tocItems: SettingTOCItem[] = useMemo(() => {
    const serviceItem = { id: 'service', label: t('admin:moderation.service_title') };
    if (!policy.enabled) return [serviceItem];

    return [
      serviceItem,
      { id: 'hooks', label: t('admin:moderation.hooks_title') },
      { id: 'strategy', label: t('admin:moderation.strategy_title') },
      ...(showTestSection ? [{ id: 'test', label: t('admin:moderation.test_title') }] : [])
    ];
  }, [policy.enabled, showTestSection, t]);

  const isUnsaved = Boolean(persistedPolicy && !isEqual(policy, persistedPolicy));

  return (
    <>
      <AdminSettingPage
        headerTitle={t('admin:page_title_moderation_policy')}
        tocItems={tocItems}
        isLoading={isPolicyBusy}
        isSaving={savingPolicy}
        isUnsaved={isUnsaved}
        onSave={handleSubmit}
      >
        {/* ================= 1. 审核服务 ================= */}
        <AdminSettingSection id="service" title={t('admin:moderation.service_title')}>
          <AdminSwitchRow
            label={t('admin:moderation.enable_moderation')}
            isChecked={policy.enabled}
            isDisabled={isPolicyBusy}
            onChange={(checked) => {
              updatePolicy((prev) => ({
                ...prev,
                enabled: checked
              }));
            }}
          />

          {/* 当开启内容审核时展示服务与插件管理列表 */}
          {policy.enabled && (
            <>
              {/* 当前生效服务 & 全部收起/展开 */}
              <Flex alignItems={'center'} justifyContent={'space-between'} mt={4} minH={'32px'}>
                <Flex alignItems={'center'} gap={2}>
                  <Text fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
                    {t('admin:moderation.active_service')}
                  </Text>
                  <Text fontSize={'sm'} color={'myGray.600'}>
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
                <Box mt={4}>
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
                          isDisabled={isPolicyBusy}
                          onClick={handleAddFromMarket}
                        >
                          {t('admin:moderation.add_from_marketplace')}
                        </Button>
                        <Button
                          variant={'whiteBase'}
                          size={'md'}
                          h={'36px'}
                          leftIcon={<MyIcon name="common/addLight" w={'16px'} />}
                          isDisabled={isPolicyBusy}
                          onClick={() => {
                            if (!isPolicyBusy) onOpenImport();
                          }}
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
                              isDisabled={isPolicyBusy || Boolean(activatingPluginId)}
                              onActivate={() => void handleActivatePlugin(plugin)}
                              onEdit={() => {
                                if (!isPolicyBusy && !activatingPluginRef.current) {
                                  setEditingPlugin(plugin);
                                }
                              }}
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
                          isDisabled={isPolicyBusy}
                          onClick={handleAddFromMarket}
                        >
                          {t('admin:moderation.add_from_marketplace')}
                        </Button>
                        <Button
                          variant={'whiteBase'}
                          size={'md'}
                          h={'36px'}
                          leftIcon={<MyIcon name="common/addLight" w={'16px'} />}
                          isDisabled={isPolicyBusy}
                          onClick={() => {
                            if (!isPolicyBusy) onOpenImport();
                          }}
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
        </AdminSettingSection>

        {/* ================= 下方 3 个板块仅在开启内容审核时显示 ================= */}
        {policy.enabled && (
          <>
            {/* ================= 2. 审核生效环节 ================= */}
            <AdminSettingSection id="hooks" title={t('admin:moderation.hooks_title')} showDivider>
              <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
                {/* 用户输入 */}
                <AdminSwitchRow
                  label={t('admin:moderation.hook_user_input')}
                  tooltip={t('admin:moderation.hook_user_input_tip')}
                  isChecked={policy.hooks.userInput}
                  isDisabled={isPolicyBusy}
                  onChange={(checked) => {
                    updatePolicy((prev) => ({
                      ...prev,
                      hooks: { ...prev.hooks, userInput: checked }
                    }));
                  }}
                />

                {/* 模型输入 */}
                <AdminSwitchRow
                  label={t('admin:moderation.hook_model_input')}
                  tooltip={t('admin:moderation.hook_model_input_tip')}
                  isChecked={policy.hooks.modelInput}
                  isDisabled={isPolicyBusy}
                  onChange={(checked) => {
                    updatePolicy((prev) => ({
                      ...prev,
                      hooks: { ...prev.hooks, modelInput: checked }
                    }));
                  }}
                />

                {/* 最终输出 */}
                <AdminSwitchRow
                  label={t('admin:moderation.hook_final_output')}
                  tooltip={t('admin:moderation.hook_final_output_tip')}
                  isChecked={policy.hooks.finalOutput}
                  isDisabled={isPolicyBusy}
                  onChange={(checked) => {
                    updatePolicy((prev) => ({
                      ...prev,
                      hooks: { ...prev.hooks, finalOutput: checked }
                    }));
                  }}
                />
              </SimpleGrid>
            </AdminSettingSection>

            {/* ================= 3. 处理策略 ================= */}
            <AdminSettingSection
              id="strategy"
              title={t('admin:moderation.strategy_title')}
              showDivider
            >
              {/* 流式审核间隔 */}
              <AdminFormItem
                label={t('admin:moderation.stream_interval')}
                tooltip={t('admin:moderation.stream_interval_tip')}
              >
                <HStack spacing={2}>
                  <MyNumberInput
                    min={1}
                    precision={0}
                    w={'160px'}
                    variant={'whiteOutline'}
                    isDisabled={isPolicyBusy}
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
              </AdminFormItem>

              {/* 疑似风险 */}
              <AdminFormItem
                label={t('admin:moderation.suspected_risk')}
                tooltip={t('admin:moderation.suspected_risk_tip')}
              >
                <MySelect
                  width={'100%'}
                  isDisabled={isPolicyBusy}
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
              </AdminFormItem>

              {/* 服务异常 */}
              <AdminFormItem
                label={t('admin:moderation.service_exception')}
                tooltip={t('admin:moderation.service_exception_tip')}
                mb={0}
              >
                <MySelect
                  width={'100%'}
                  isDisabled={isPolicyBusy}
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
              </AdminFormItem>
            </AdminSettingSection>

            {/* ================= 4. 审核效果测试 ================= */}
            {activePlugin !== undefined && (
              <AdminSettingSection id="test" title={t('admin:moderation.test_title')} showDivider>
                <ModerationTestCard activePlugin={activePlugin} />
              </AdminSettingSection>
            )}
          </>
        )}
      </AdminSettingPage>

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
            void enqueuePageOperation(async () => {
              await Promise.allSettled([fetchPlugins()]);
            });
          }}
        />
      )}

      {/* 卸载最后一个审核插件确认弹窗 */}
      <UninstallLastPluginModal isLoading={uninstallingLastPlugin} />
    </>
  );
};

export default ModerationPolicy;
