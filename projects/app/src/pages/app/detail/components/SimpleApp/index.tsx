import React, { useState } from 'react';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';

import Header from './Header';
import Edit from './Edit';
import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import dynamic from 'next/dynamic';
import { Box, Flex } from '@chakra-ui/react';
import { useBeforeunload } from '@fastgpt/web/hooks/useBeforeunload';
import { useTranslation } from 'next-i18next';
import useSnapshots from './useSnapshots';

const Logs = dynamic(() => import('../Logs/index'));
const PublishChannel = dynamic(() => import('../Publish'));

const SimpleEdit = () => {
  const { t } = useTranslation();
  const { currentTab, appDetail } = useContextSelector(AppContext, (v) => v);
  const { past, setPast, saveSnapshot } = useSnapshots(appDetail._id);

  const [appForm, setAppForm] = useState(getDefaultAppForm());

  useBeforeunload({
    tip: t('common:core.common.tip.leave page')
  });

  return (
    <Flex h={'100%'} flexDirection={'column'} px={[3, 0]} pr={[3, 3]}>
      <Header
        appForm={appForm}
        setAppForm={setAppForm}
        past={past}
        setPast={setPast}
        saveSnapshot={saveSnapshot}
      />
      {currentTab === TabEnum.appEdit ? (
        <Edit appForm={appForm} setAppForm={setAppForm} past={past} saveSnapshot={saveSnapshot} />
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
