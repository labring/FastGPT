import React, { useState } from 'react';
import { appWorkflow2Form, getDefaultAppForm } from '@fastgpt/global/core/app/utils';

import Header from './Header';
import Edit from './Edit';
import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import dynamic from 'next/dynamic';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { SimpleAppSnapshotType, useSimpleAppSnapshots } from './useSnapshots';
import { useDebounceEffect, useMount } from 'ahooks';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { v1Workflow2V2 } from '@/web/core/workflow/adapt';
import { getAppConfigByDiff } from '@/web/core/app/diff';

const Logs = dynamic(() => import('../Logs/index'));
const PublishChannel = dynamic(() => import('../Publish'));

const SimpleEdit = () => {
  const { t } = useTranslation();
  const { loadAllDatasets } = useDatasetStore();

  const { currentTab, appDetail } = useContextSelector(AppContext, (v) => v);
  const { forbiddenSaveSnapshot, past, setPast, saveSnapshot } = useSimpleAppSnapshots(
    appDetail._id
  );

  const [appForm, setAppForm] = useState(getDefaultAppForm());

  // Init app form
  useMount(() => {
    // show selected dataset
    loadAllDatasets();

    if (appDetail.version !== 'v2') {
      return setAppForm(
        appWorkflow2Form({
          nodes: v1Workflow2V2((appDetail.modules || []) as any)?.nodes,
          chatConfig: appDetail.chatConfig
        })
      );
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
      return setAppForm(pastState);
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
      setAppForm(appForm);
    } else {
      setAppForm(past[0].appForm);
    }
  });

  // Save snapshot to local
  useDebounceEffect(
    () => {
      saveSnapshot({
        appForm
      });
    },
    [appForm],
    { wait: 500 }
  );

  return (
    <Flex h={'100%'} flexDirection={'column'} px={[3, 0]} pr={[3, 3]}>
      <Header
        appForm={appForm}
        forbiddenSaveSnapshot={forbiddenSaveSnapshot}
        setAppForm={setAppForm}
        past={past}
        setPast={setPast}
        saveSnapshot={saveSnapshot}
      />
      {currentTab === TabEnum.appEdit ? (
        <Edit appForm={appForm} setAppForm={setAppForm} setPast={setPast} />
      ) : (
        <Box flex={'1 0 0'} h={0} mt={[4, 0]}>
          {currentTab === TabEnum.publish && <PublishChannel />}
          {currentTab === TabEnum.logs && <Logs />}
        </Box>
      )}
    </Flex>
  );
};

export default React.memo(SimpleEdit);
