import FolderPath from '@/components/common/folder/Path';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { ensureModelCatalog } from '@/web/core/ai/model/modelData';
import { hydrateRuntime } from '@/web/core/workflow/editor/codec';
import {
  collectWorkflowErrorIssues,
  renderWorkflowIssueMessage
} from '@/web/core/workflow/issueView';
import { peekWorkflowEnvironmentModels } from '@/web/core/workflow/modelData';
import { useUserStore } from '@/web/support/user/useUserStore';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { isProduction } from '@fastgpt/global/common/system/constants';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useBeforeunload } from '@fastgpt/web/hooks/useBeforeunload';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useBoolean, useDebounceEffect, useLockFn } from 'ahooks';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { publishStatusStyle } from '../../constants';
import { AppContext, TabEnum } from '../../context';
import PublishHistories from '../../PublishHistoriesSlider';
import RouteTab from '../../RouteTab';
import SaveButton from '../../Workflow/components/SaveButton';
import { checkAgentSkillSandboxUnavailable } from '../ChatAgent/utils';
import type { AppForm2WorkflowFnType, Form2WorkflowFnType } from './type';
import {
  compareSimpleAppSnapshot,
  type onSaveSnapshotFnType,
  type SimpleAppSnapshotType
} from './useSnapshots';

const Header = ({
  forbiddenSaveSnapshot: forbiddenSaveSnapshotRef,
  appForm,
  setAppForm,
  past,
  setPast,
  saveSnapshot,
  form2WorkflowFn,
  form2AppWorkflowFn
}: {
  forbiddenSaveSnapshot: React.MutableRefObject<boolean>;
  appForm: AppFormEditFormType;
  setAppForm: (form: AppFormEditFormType) => void;
  past: SimpleAppSnapshotType[];
  setPast: (value: React.SetStateAction<SimpleAppSnapshotType[]>) => void;
  saveSnapshot: onSaveSnapshotFnType;
  form2AppWorkflowFn: AppForm2WorkflowFnType;
  form2WorkflowFn: Form2WorkflowFnType;
}) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const { toast } = useToast();
  const router = useRouter();
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const onSaveApp = useContextSelector(AppContext, (v) => v.onSaveApp);
  const currentTab = useContextSelector(AppContext, (v) => v.currentTab);

  const { lastAppListRouteType, feConfigs } = useSystemStore();
  const { teamPlanStatus } = useUserStore();
  const enableSandbox = !teamPlanStatus?.standard || !!teamPlanStatus?.standard?.enableSandbox;
  const showSandbox = feConfigs.show_agent_sandbox;

  const { data: paths = [] } = useRequest(
    () => getAppFolderPath({ sourceId: appId, type: 'parent' }),
    {
      manual: false,
      refreshDeps: [appId]
    }
  );
  const onClickRoute = useCallback(
    (parentId: ParentIdType) => {
      router.push({
        pathname: '/dashboard/agent',
        query: {
          parentId: parentId || '',
          type: lastAppListRouteType
        }
      });
    },
    [router, lastAppListRouteType]
  );

  const { runAsync: onClickSave, loading } = useRequest(
    async ({
      isPublish,
      versionName = formatTime2YMDHMS(new Date()),
      autoSave
    }: {
      isPublish?: boolean;
      versionName?: string;
      autoSave?: boolean;
    }) => {
      const { nodes, edges } = form2WorkflowFn(appForm, t);
      const saved = await onSaveApp({
        nodes,
        edges,
        chatConfig: appForm.chatConfig,
        isPublish,
        versionName,
        autoSave
      });
      if (!saved) return;
      setPast((prevPast) =>
        prevPast.map((item, index) =>
          index === 0
            ? {
                ...item,
                isSaved: true
              }
            : item
        )
      );
    }
  );

  const [isShowHistories, { setTrue: setIsShowHistories, setFalse: closeHistories }] =
    useBoolean(false);

  const onSwitchTmpVersion = useCallback(
    (data: SimpleAppSnapshotType, customTitle: string) => {
      setAppForm(data.appForm);

      // Remove multiple "copy-"
      const copyText = t('app:version_copy');
      const regex = new RegExp(`(${copyText}-)\\1+`, 'g');
      const title = customTitle.replace(regex, `$1`);

      return saveSnapshot({
        appForm: data.appForm,
        title
      });
    },
    [saveSnapshot, setAppForm, t]
  );
  const onSwitchCloudVersion = useCallback(
    (appVersion: AppVersionSchemaType) => {
      const appForm = form2AppWorkflowFn({
        nodes: appVersion.nodes,
        chatConfig: appVersion.chatConfig
      });

      const res = saveSnapshot({
        appForm,
        title: `${t('app:version_copy')}-${appVersion.versionName}`
      });
      forbiddenSaveSnapshotRef.current = true;

      setAppForm(appForm);

      return res;
    },
    [forbiddenSaveSnapshotRef, saveSnapshot, setAppForm, t]
  );

  // Check if the workflow is published
  const [isSaved, setIsSaved] = useState(false);
  useDebounceEffect(
    () => {
      const savedSnapshot = past.find((snapshot) => snapshot.isSaved);
      const val = compareSimpleAppSnapshot(savedSnapshot?.appForm, appForm);
      setIsSaved(val);
    },
    [past],
    { wait: 500 }
  );

  const onLeaveAutoSave = useLockFn(async () => {
    if (isSaved) return;
    try {
      console.log('Leave auto save');
      return onClickSave({ isPublish: false, autoSave: true });
    } catch (error) {
      console.error(error);
    }
  });
  useEffect(() => {
    return () => {
      if (isProduction) {
        onLeaveAutoSave();
      }
    };
  }, []);
  useBeforeunload({
    tip: t('common:core.tip.leave page'),
    callback: onLeaveAutoSave
  });

  return (
    <Box h={14}>
      {!isPc && (
        <Flex justifyContent={'center'}>
          <RouteTab />
        </Flex>
      )}
      <Flex w={'full'} alignItems={'center'} position={'relative'} h={'full'}>
        <Box flex={'1'} ml={'16px'}>
          <FolderPath
            rootName={t('common:All')}
            paths={paths}
            hoverStyle={{ color: 'primary.600' }}
            onClick={onClickRoute}
            fontSize={'14px'}
          />
        </Box>
        {isPc && (
          <Box position={'absolute'} left={'50%'} transform={'translateX(-50%)'}>
            <RouteTab />
          </Box>
        )}
        {currentTab === TabEnum.appEdit && (
          <Flex alignItems={'center'}>
            {!isShowHistories && isPc && (
              <MyTag
                mr={3}
                type={'borderFill'}
                showDot
                colorSchema={
                  isSaved
                    ? publishStatusStyle.published.colorSchema
                    : publishStatusStyle.unPublish.colorSchema
                }
              >
                {t(isSaved ? publishStatusStyle.published.text : publishStatusStyle.unPublish.text)}
              </MyTag>
            )}

            <IconButton
              mr={[2, 4]}
              icon={<MyIcon name={'history'} w={'18px'} />}
              aria-label={''}
              size={'sm'}
              w={'34px'}
              h={'34px'}
              variant={'whitePrimary'}
              onClick={isShowHistories ? closeHistories : setIsShowHistories}
            />
            <SaveButton
              colorSchema="primary"
              isLoading={loading}
              isDisabled={isShowHistories}
              onClickSave={onClickSave}
              checkData={async () => {
                if (
                  checkAgentSkillSandboxUnavailable({
                    appForm,
                    showSandbox,
                    enableSandbox
                  })
                ) {
                  toast({
                    title: t('skill:sandbox_skill_unavailable_toast'),
                    status: 'warning'
                  });
                  return false;
                }

                if (appForm.aiSettings.useAgentSandbox) {
                  if (!showSandbox) {
                    toast({
                      title: t('skill:sandbox_system_not_configured_toast'),
                      status: 'warning'
                    });
                    return false;
                  }
                  if (!enableSandbox) {
                    toast({
                      title: t('app:sandbox_free_not_support'),
                      status: 'warning'
                    });
                    return false;
                  }
                }

                const { nodes: storeNodes, edges: storeEdges } = form2WorkflowFn(appForm, t);
                // 目录未就绪时模型类问题会整体漏判，宁可挡住发布也不放过；先确认目录再建 Runtime。
                const catalog = await ensureModelCatalog().catch(() => undefined);
                if (!catalog) {
                  toast({ status: 'error', title: t('common:model_catalog_load_failed') });
                  return false;
                }
                // 简易应用编辑器没有常驻 Runtime：现场 hydrate 一份，走与工作流编辑器同一条 gate。
                const runtime = hydrateRuntime({
                  input: { nodes: storeNodes, edges: storeEdges },
                  chatConfig: appForm.chatConfig,
                  t,
                  getEnvironment: () => ({
                    models: peekWorkflowEnvironmentModels(),
                    sandbox: { configured: !!showSandbox, planSupported: enableSandbox }
                  })
                });
                const errors = collectWorkflowErrorIssues(runtime);
                runtime.dispose();

                if (errors.length > 0) {
                  toast({
                    title: t('app:app.error.publish_unExist_app'),
                    description: errors
                      .map((issue) => renderWorkflowIssueMessage(issue, t))
                      .join('\n'),
                    status: 'warning'
                  });
                }
                return errors.length === 0;
              }}
            />
          </Flex>
        )}
      </Flex>

      <PublishHistories<SimpleAppSnapshotType>
        isOpen={isShowHistories && currentTab === TabEnum.appEdit}
        onClose={closeHistories}
        past={past}
        onSwitchTmpVersion={onSwitchTmpVersion}
        onSwitchCloudVersion={onSwitchCloudVersion}
        topOffset={14}
        panelHeight={'calc(100vh - 68px)'}
      />
    </Box>
  );
};

export default Header;
