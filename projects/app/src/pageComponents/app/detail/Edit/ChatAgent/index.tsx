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
import { getGeneratedSkillList } from '@/components/core/chat/HelperBot/generatedSkill/api';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { defaultSkill } from './SkillEdit/Row';
import type { SkillEditType } from '@fastgpt/global/core/app/formEdit/type';

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

    // 加载技能列表
    try {
      const result = await getGeneratedSkillList({
        appId: appDetail._id,
        current: 1,
        pageSize: 100
      });

      // 将数据库数据映射为 SkillEditType 格式
      const skills: SkillEditType[] = result.list.map((skill) => ({
        id: getNanoid(6),
        dbId: skill._id,
        name: skill.name,
        description: skill.description || '',
        stepsText: skill.steps || '',
        dataset: { list: [] },
        selectedTools: [],
        fileSelectConfig: defaultSkill.fileSelectConfig
      }));

      // 合并技能列表到 appForm
      setAppForm({
        ...initialAppForm,
        skills: skills
      });
    } catch (error) {
      console.error('Failed to load skills:', error);
      // 即使加载失败也要设置 appForm
      setAppForm(initialAppForm);
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
