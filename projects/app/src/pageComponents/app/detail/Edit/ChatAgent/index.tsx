import React, { useState } from 'react';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { agentForm2AppWorkflow, appWorkflow2AgentForm } from './utils';

import Header from '../FormComponent/Header';
import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../../context';
import dynamic from 'next/dynamic';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useSimpleAppSnapshots } from '../FormComponent/useSnapshots';
import { useDebounceEffect, useMount } from 'ahooks';
import { defaultAppSelectFileConfig } from '@fastgpt/global/core/app/constants';
import { getAiSkillList } from '@/web/core/ai/skill/api';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { defaultSkill } from './SkillEdit/Row';
import type { SkillEditType } from '@fastgpt/global/core/app/formEdit/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

const Edit = dynamic(() => import('./Edit'));
const Logs = dynamic(() => import('../../Logs/index'));
const PublishChannel = dynamic(() => import('../../Publish'));

const AgentEdit = () => {
  const { t } = useTranslation();

  const { currentTab, appDetail } = useContextSelector(AppContext, (v) => v);
  const { forbiddenSaveSnapshot, past, setPast, saveSnapshot } = useSimpleAppSnapshots(
    appDetail._id
  );

  const [appForm, setAppForm] = useState(getDefaultAppForm());

  // Init app form
  useMount(async () => {
    let initialAppForm;

    if (past.length === 0) {
      initialAppForm = appWorkflow2AgentForm({
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
        appForm: initialAppForm,
        title: t('app:initial_form'),
        isSaved: true
      });
    } else {
      initialAppForm = past[0].appForm;
    }

    // Set initial app form
    setAppForm(initialAppForm);
  });

  // Load skills list using useRequest2
  useRequest2(
    async () => {
      const result = await getAiSkillList({
        appId: appDetail._id
      });

      // Map database data to SkillEditType format
      const skills: SkillEditType[] = result.map((skill) => ({
        id: skill._id,
        name: skill.name,
        description: '',
        stepsText: '',
        dataset: { list: [] },
        selectedTools: []
      }));

      // Update appForm with skills
      setAppForm((state) => ({
        ...state,
        skills
      }));

      return skills;
    },
    {
      manual: false
    }
  );

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
        form2WorkflowFn={agentForm2AppWorkflow}
        form2AppWorkflowFn={appWorkflow2AgentForm}
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
