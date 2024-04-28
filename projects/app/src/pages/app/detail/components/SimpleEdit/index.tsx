import React from 'react';
import { Box, Grid } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useSticky } from '@/web/common/hooks/useSticky';

import ChatTest from './ChatTest';
import AppCard from './AppCard';
import EditForm from './EditForm';
import { useMount } from 'ahooks';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import { SimpleEditProvider } from './Context';

const SimpleEdit = ({ appId }: { appId: string }) => {
  const { isPc } = useSystemStore();
  const { parentRef, divRef, isSticky } = useSticky();
  const { loadAllDatasets } = useDatasetStore();

  useMount(() => {
    loadAllDatasets();
  });

  return (
    <SimpleEditProvider>
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
            <EditForm divRef={divRef} isSticky={isSticky} />
          </Box>
        </Box>
        {isPc && <ChatTest appId={appId} />}
      </Grid>
    </SimpleEditProvider>
  );
};

export default React.memo(SimpleEdit);
