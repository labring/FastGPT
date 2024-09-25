import React, { useCallback, useState } from 'react';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import FolderPath from '@/components/common/folder/Path';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import RouteTab from '../RouteTab';
import { useTranslation } from 'next-i18next';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { form2AppWorkflow } from '@/web/core/app/utils';
import { TabEnum } from '../context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { publishStatusStyle } from '../constants';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import SaveButton from '../Workflow/components/SaveButton';
import dynamic from 'next/dynamic';
import { useDebounceEffect } from 'ahooks';
import { InitProps, SnapshotsType } from '../WorkflowComponents/context';
import { appWorkflow2Form } from '@fastgpt/global/core/app/utils';
import {
  compareSnapshot,
  storeEdgesRenderEdge,
  storeNode2FlowNode
} from '@/web/core/workflow/utils';
import { uiWorkflow2StoreWorkflow } from '../WorkflowComponents/utils';
import { SaveSnapshotFnType } from './useSnapshots';

const PublishHistories = dynamic(() => import('../PublishHistoriesSlider'));

const Header = ({
  appForm,
  setAppForm,
  past,
  setPast,
  saveSnapshot
}: {
  appForm: AppSimpleEditFormType;
  setAppForm: (form: AppSimpleEditFormType) => void;
  past: SnapshotsType[];
  setPast: (value: React.SetStateAction<SnapshotsType[]>) => void;
  saveSnapshot: SaveSnapshotFnType;
}) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const router = useRouter();
  const { appId, onSaveApp, currentTab } = useContextSelector(AppContext, (v) => v);
  const { lastAppListRouteType } = useSystemStore();
  const { allDatasets } = useDatasetStore();

  const { data: paths = [] } = useRequest2(() => getAppFolderPath(appId), {
    manual: false,
    refreshDeps: [appId]
  });
  const onClickRoute = useCallback(
    (parentId: string) => {
      router.push({
        pathname: '/app/list',
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
      versionName = formatTime2YMDHMS(new Date())
    }: {
      isPublish?: boolean;
      versionName?: string;
    }) => {
      const { nodes, edges } = form2AppWorkflow(appForm, t);
      await onSaveApp({
        nodes,
        edges,
        chatConfig: appForm.chatConfig,
        type: AppTypeEnum.simple,
        isPublish,
        versionName
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

  const [historiesDefaultData, setHistoriesDefaultData] = useState<InitProps>();

  const resetSnapshot = useCallback(
    (data: SnapshotsType) => {
      const storeWorkflow = uiWorkflow2StoreWorkflow(data);
      const currentAppForm = appWorkflow2Form({ ...storeWorkflow, chatConfig: data.chatConfig });

      setAppForm(currentAppForm);
    },
    [setAppForm]
  );

  // Save snapshot to local
  useDebounceEffect(
    () => {
      const data = form2AppWorkflow(appForm, t);

      saveSnapshot({
        pastNodes: data.nodes?.map((item) => storeNode2FlowNode({ item, t })),
        chatConfig: data.chatConfig
      });
    },
    [appForm],
    { wait: 500 }
  );

  // Check if the workflow is published
  const [isPublished, setIsPublished] = useState(false);
  useDebounceEffect(
    () => {
      const savedSnapshot = past.find((snapshot) => snapshot.isSaved);
      const editFormData = form2AppWorkflow(appForm, t);
      console.log(savedSnapshot?.nodes, editFormData.chatConfig);
      const val = compareSnapshot(
        {
          nodes: savedSnapshot?.nodes,
          edges: [],
          chatConfig: savedSnapshot?.chatConfig
        },
        {
          nodes: editFormData.nodes?.map((item) => storeNode2FlowNode({ item, t })),
          edges: [],
          chatConfig: editFormData.chatConfig
        }
      );
      setIsPublished(val);
    },
    [past, allDatasets],
    { wait: 500 }
  );

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
            rootName={t('app:all_apps')}
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
            {!historiesDefaultData && (
              <>
                {isPc && (
                  <MyTag
                    mr={3}
                    type={'borderFill'}
                    showDot
                    colorSchema={
                      isPublished
                        ? publishStatusStyle.published.colorSchema
                        : publishStatusStyle.unPublish.colorSchema
                    }
                  >
                    {t(
                      isPublished
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
                  onClick={() => {
                    const { nodes, edges } = form2AppWorkflow(appForm, t);
                    setHistoriesDefaultData({
                      nodes,
                      edges,
                      chatConfig: appForm.chatConfig
                    });
                  }}
                />
                <SaveButton isLoading={loading} onClickSave={onClickSave} />
              </>
            )}
          </Flex>
        )}
      </Flex>

      {historiesDefaultData && currentTab === TabEnum.appEdit && (
        <PublishHistories
          onClose={() => {
            setHistoriesDefaultData(undefined);
          }}
          past={past}
          saveSnapshot={saveSnapshot}
          resetSnapshot={resetSnapshot}
          top={14}
          bottom={3}
        />
      )}
    </Box>
  );
};

export default Header;
