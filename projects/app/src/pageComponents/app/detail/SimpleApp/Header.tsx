import React, { useCallback, useEffect, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import FolderPath from '@/components/common/folder/Path';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import RouteTab from '../RouteTab';
import { useTranslation } from 'next-i18next';
import { type AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { form2AppWorkflow } from '@/web/core/app/utils';
import { TabEnum } from '../context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { publishStatusStyle } from '../constants';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import SaveButton from '../Workflow/components/SaveButton';
import { useBoolean, useDebounceEffect, useLockFn } from 'ahooks';
import { appWorkflow2Form } from '@fastgpt/global/core/app/utils';
import {
  compareSimpleAppSnapshot,
  type onSaveSnapshotFnType,
  type SimpleAppSnapshotType
} from './useSnapshots';
import PublishHistories from '../PublishHistoriesSlider';
import { type AppVersionSchemaType } from '@fastgpt/global/core/app/version';
import { useBeforeunload } from '@fastgpt/web/hooks/useBeforeunload';
import { isProduction } from '@fastgpt/global/common/system/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  checkWorkflowNodeAndConnection,
  storeEdge2RenderEdge,
  storeNode2FlowNode
} from '@/web/core/workflow/utils';

const Header = ({
  forbiddenSaveSnapshot,
  appForm,
  setAppForm,
  past,
  setPast,
  saveSnapshot
}: {
  forbiddenSaveSnapshot: React.MutableRefObject<boolean>;
  appForm: AppSimpleEditFormType;
  setAppForm: (form: AppSimpleEditFormType) => void;
  past: SimpleAppSnapshotType[];
  setPast: (value: React.SetStateAction<SimpleAppSnapshotType[]>) => void;
  saveSnapshot: onSaveSnapshotFnType;
}) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const { toast } = useToast();
  const router = useRouter();
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const onSaveApp = useContextSelector(AppContext, (v) => v.onSaveApp);
  const currentTab = useContextSelector(AppContext, (v) => v.currentTab);

  const { lastAppListRouteType } = useSystemStore();

  const { data: paths = [] } = useRequest2(
    () => getAppFolderPath({ sourceId: appId, type: 'parent' }),
    {
      manual: false,
      refreshDeps: [appId]
    }
  );
  const onClickRoute = useCallback(
    (parentId: string) => {
      router.push({
        pathname: '/dashboard/agent',
        query: {
          parentId,
          type: lastAppListRouteType
        }
      });
    },
    [router, lastAppListRouteType]
  );

  const { runAsync: onClickSave, loading } = useRequest2(
    async ({
      isPublish,
      versionName = formatTime2YMDHMS(new Date()),
      autoSave
    }: {
      isPublish?: boolean;
      versionName?: string;
      autoSave?: boolean;
    }) => {
      const { nodes, edges } = form2AppWorkflow(appForm, t);
      await onSaveApp({
        nodes,
        edges,
        chatConfig: appForm.chatConfig,
        isPublish,
        versionName,
        autoSave
      });
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
      const appForm = appWorkflow2Form({
        nodes: appVersion.nodes,
        chatConfig: appVersion.chatConfig
      });

      const res = saveSnapshot({
        appForm,
        title: `${t('app:version_copy')}-${appVersion.versionName}`
      });
      forbiddenSaveSnapshot.current = true;

      setAppForm(appForm);

      return res;
    },
    [forbiddenSaveSnapshot, saveSnapshot, setAppForm, t]
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
        <Box flex={'1'}>
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
            {!isShowHistories && (
              <>
                {isPc && (
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
                    {t(
                      isSaved
                        ? publishStatusStyle.published.text
                        : publishStatusStyle.unPublish.text
                    )}
                  </MyTag>
                )}

                <IconButton
                  mr={[2, 4]}
                  icon={<MyIcon name={'history'} w={'18px'} />}
                  aria-label={''}
                  size={'sm'}
                  w={'30px'}
                  variant={'whitePrimary'}
                  onClick={setIsShowHistories}
                />
                <SaveButton
                  isLoading={loading}
                  onClickSave={onClickSave}
                  checkData={() => {
                    const { nodes: storeNodes, edges: storeEdges } = form2AppWorkflow(appForm, t);

                    const nodes = storeNodes.map((item) => storeNode2FlowNode({ item, t }));
                    const edges = storeEdges.map((item) => storeEdge2RenderEdge({ edge: item }));

                    const checkResults = checkWorkflowNodeAndConnection({ nodes, edges });

                    if (checkResults) {
                      toast({
                        title: t('app:app.error.publish_unExist_app'),
                        status: 'warning'
                      });
                    }
                    return !checkResults;
                  }}
                />
              </>
            )}
          </Flex>
        )}
      </Flex>

      {isShowHistories && currentTab === TabEnum.appEdit && (
        <PublishHistories<SimpleAppSnapshotType>
          onClose={closeHistories}
          past={past}
          onSwitchTmpVersion={onSwitchTmpVersion}
          onSwitchCloudVersion={onSwitchCloudVersion}
          positionStyles={{
            top: 14,
            bottom: 3
          }}
        />
      )}
    </Box>
  );
};

export default Header;
