import React from 'react';
import { Box, Grid } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useSticky } from '@/web/common/hooks/useSticky';
import { useMount } from 'ahooks';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { useAppStore } from '@/web/core/app/store/useAppStore';
import { useForm } from 'react-hook-form';
import { appWorkflow2Form } from '@fastgpt/global/core/app/utils';

import ChatTest from './ChatTest';
import AppCard from './AppCard';
import EditForm from './EditForm';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';

const SimpleEdit = ({ appId }: { appId: string }) => {
  const { isPc } = useSystemStore();
  const { parentRef, divRef, isSticky } = useSticky();
  const { loadAllDatasets } = useDatasetStore();
  const { appDetail } = useAppStore();

  const editForm = useForm<AppSimpleEditFormType>({
    defaultValues: appWorkflow2Form({
      nodes: appDetail.modules
    })
  });

  // show selected dataset
  useMount(() => {
    loadAllDatasets();
  });

  return (
    <Grid gridTemplateColumns={['1fr', '560px 1fr']} h={'100%'}>
      <Box
        ref={parentRef}
        h={'100%'}
        borderRight={'1.5px solid'}
        borderColor={'myGray.200'}
        pt={[0, 4]}
        pb={10}
        overflow={'overlay'}
      >
        <AppCard appId={appId} />

        <Box mt={2}>
          <EditForm editForm={editForm} divRef={divRef} isSticky={isSticky} />
        </Box>
      </Box>
      {isPc && <ChatTest editForm={editForm} appId={appId} />}
    </Grid>
  );
};

export default React.memo(SimpleEdit);
