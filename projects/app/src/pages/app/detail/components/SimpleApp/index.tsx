import React, { useState } from 'react';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';

import Header from './Header';
import Edit from './Edit';
import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import dynamic from 'next/dynamic';
import { Flex } from '@chakra-ui/react';
import { useBeforeunload } from '@fastgpt/web/hooks/useBeforeunload';
import { useTranslation } from 'next-i18next';

const Logs = dynamic(() => import('../Logs/index'));
const PublishChannel = dynamic(() => import('../Publish'));

const SimpleEdit = () => {
  const { t } = useTranslation();
  const { currentTab } = useContextSelector(AppContext, (v) => v);

  const [appForm, setAppForm] = useState(getDefaultAppForm());

  useBeforeunload({
    tip: t('core.common.tip.leave page')
  });

  return (
    <Flex h={'100%'} flexDirection={'column'} pr={3} pb={3}>
      <Header appForm={appForm} setAppForm={setAppForm} />
      {currentTab === TabEnum.appEdit ? (
        <Edit appForm={appForm} setAppForm={setAppForm} />
      ) : (
        <Flex h={'100%'} flexDirection={'column'} mt={4}>
          {currentTab === TabEnum.publish && <PublishChannel />}
          {currentTab === TabEnum.logs && <Logs />}
        </Flex>
      )}
    </Flex>
  );
};

export default React.memo(SimpleEdit);
