import React from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
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
import { UseFormReturn } from 'react-hook-form';
import { cardStyles } from '../constants';

import styles from './styles.module.scss';

const Edit = ({ editForm }: { editForm: UseFormReturn<AppSimpleEditFormType, any> }) => {
  const { isPc } = useSystemStore();
  const { loadAllDatasets } = useDatasetStore();
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  // show selected dataset
  useMount(() => {
    loadAllDatasets();

    editForm.reset(
      appWorkflow2Form({
        nodes: appDetail.modules,
        chatConfig: appDetail.chatConfig
      })
    );

    if (appDetail.version !== 'v2') {
      editForm.reset(
        appWorkflow2Form({
          nodes: v1Workflow2V2((appDetail.modules || []) as any)?.nodes,
          chatConfig: appDetail.chatConfig
        })
      );
    }
  });

  return (
    <Box
      display={['block', 'grid']}
      flex={'1 0 0'}
      h={0}
      pt={[2, 1.5]}
      pl={[2, 1]}
      gridTemplateColumns={['1fr', 'minmax(580px, 1fr) 2fr']}
      gap={1}
      borderRadius={'lg'}
      overflowY={['auto', 'unset']}
    >
      <Box className={styles.EditAppBox} pr={[0, 1]} overflowY={'auto'}>
        <Box {...cardStyles} boxShadow={'2'}>
          <AppCard />
        </Box>

        <Box mt={4} {...cardStyles} boxShadow={'3.5'}>
          <EditForm editForm={editForm} />
        </Box>
      </Box>
      {isPc && (
        <Box {...cardStyles} boxShadow={'3'}>
          <ChatTest editForm={editForm} />
        </Box>
      )}
    </Box>
  );
};

export default React.memo(Edit);
