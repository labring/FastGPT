import React from 'react';
import { Box, Grid } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useSticky } from '@/web/common/hooks/useSticky';

import ChatTest from './ChatTest';
import AppCard from './AppCard';
import EditForm from './EditForm';

const SimpleEdit = ({ appId }: { appId: string }) => {
  const { isPc } = useSystemStore();
  const { parentRef, divRef, isSticky } = useSticky();

  return (
    <Grid gridTemplateColumns={['1fr', '550px 1fr']} h={'100%'}>
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
  );
};

export default React.memo(SimpleEdit);
