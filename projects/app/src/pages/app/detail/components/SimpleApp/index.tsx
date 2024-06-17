import React from 'react';
import { useForm } from 'react-hook-form';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';

import Header from './Header';
import Edit from './Edit';
import { useContextSelector } from 'use-context-selector';
import { AppContext, TabEnum } from '../context';
import dynamic from 'next/dynamic';
import { Flex } from '@chakra-ui/react';

const Logs = dynamic(() => import('../Logs/index'));
const PublishChannel = dynamic(() => import('../Publish'));

const SimpleEdit = () => {
  const { currentTab } = useContextSelector(AppContext, (v) => v);

  const editForm = useForm<AppSimpleEditFormType>({
    defaultValues: getDefaultAppForm()
  });

  return (
    <Flex h={'100%'} flexDirection={'column'} pr={3} pb={3}>
      <Header editForm={editForm} />
      {currentTab === TabEnum.appEdit ? (
        <Edit editForm={editForm} />
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
