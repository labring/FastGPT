import React, { useState } from 'react';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { appWorkflow2AgentForm } from './utils';

import Header from './Header';
import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import dynamic from 'next/dynamic';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useSimpleAppSnapshots } from './useSnapshots';
import { useDebounceEffect, useMount } from 'ahooks';
import { v1Workflow2V2 } from '@/web/core/workflow/adapt';
import { defaultAppSelectFileConfig } from '@fastgpt/global/core/app/constants';

const Edit = dynamic(() => import('./Edit'));
const Logs = dynamic(() => import('../Logs/index'));
const PublishChannel = dynamic(() => import('../Publish'));

const AgentEdit = () => {
  const { t } = useTranslation();

  const { currentTab, appDetail } = useContextSelector(AppContext, (v) => v);
  const { forbiddenSaveSnapshot, past, setPast, saveSnapshot } = useSimpleAppSnapshots(
    appDetail._id
  );

  const [appForm, setAppForm] = useState(getDefaultAppForm());

  // Init app form
  useMount(() => {
    if (past.length === 0) {
      const appForm = appWorkflow2AgentForm({
        nodes: appDetail.modules,
        chatConfig: {
          ...appDetail.chatConfig,
          fileSelectConfig: appDetail.chatConfig.fileSelectConfig || {
            ...defaultAppSelectFileConfig,
            canSelectFile: true
          }
        }
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
        <Box flex={'1 0 0'} h={0} mt={[4, 0]} mb={[2, 4]}>
          {currentTab === TabEnum.publish && <PublishChannel />}
          {currentTab === TabEnum.logs && <Logs />}
        </Box>
      )}
    </Flex>
  );
};

export default React.memo(AgentEdit);
