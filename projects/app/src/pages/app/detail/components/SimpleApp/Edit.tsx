import React from 'react';
import { Box } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useMount } from 'ahooks';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { appWorkflow2Form } from '@fastgpt/global/core/app/utils';

import ChatTest from './ChatTest';
import AppCard from './AppCard';
import EditForm from './EditForm';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { v1Workflow2V2 } from '@/web/core/workflow/adapt';
import { AppContext } from '@/pages/app/detail/components/context';
import { useContextSelector } from 'use-context-selector';
import { cardStyles } from '../constants';

import styles from './styles.module.scss';

const Edit = ({
  appForm,
  setAppForm
}: {
  appForm: AppSimpleEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppSimpleEditFormType>>;
}) => {
  const { isPc } = useSystemStore();
  const { loadAllDatasets } = useDatasetStore();
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  // show selected dataset
  useMount(() => {
    loadAllDatasets();

    setAppForm(
      appWorkflow2Form({
        nodes: appDetail.modules,
        chatConfig: appDetail.chatConfig
      })
    );

    if (appDetail.version !== 'v2') {
      setAppForm(
        appWorkflow2Form({
          nodes: v1Workflow2V2((appDetail.modules || []) as any)?.nodes,
          chatConfig: appDetail.chatConfig
        })
      );
    }
  });

  return (
    <Box
      display={['block', 'flex']}
      flex={'1 0 0'}
      h={0}
      pt={[2, 1.5]}
      pl={[2, 1]}
      gap={1}
      borderRadius={'lg'}
      overflowY={['auto', 'unset']}
    >
      <Box
        className={styles.EditAppBox}
        pr={[0, 1]}
        overflowY={'auto'}
        minW={['auto', '580px']}
        flex={'1'}
      >
        <Box {...cardStyles} boxShadow={'2'}>
          <AppCard />
        </Box>

        <Box mt={4} {...cardStyles} boxShadow={'3.5'}>
          <EditForm appForm={appForm} setAppForm={setAppForm} />
        </Box>
      </Box>
      {isPc && (
        <Box {...cardStyles} boxShadow={'3'} flex={'2 0 0'} w={0}>
          <ChatTest appForm={appForm} />
        </Box>
      )}
    </Box>
  );
};

export default React.memo(Edit);
