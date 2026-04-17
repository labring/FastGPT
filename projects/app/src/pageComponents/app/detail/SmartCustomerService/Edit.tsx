/**
 * @file 智能客服编辑主页面组件
 * @description 智能客服应用的编辑界面主容器，集成了助手卡片、编辑表单和聊天测试功能
 * 提供左右分栏布局：左侧为应用信息展示和配置编辑，右侧为实时聊天测试区域
 */
import React, { useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';

import ChatTest from '../Edit/SimpleApp/ChatTest';
import EditForm from './EditForm';
import AssistantCard from './AssistantCard';
import { type AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import type { Form2WorkflowFnType } from '../Edit/FormComponent/type';
import { form2AppWorkflow } from '../Edit/SimpleApp/utils';
import { cardStyles } from '../constants';

import styles from '../Edit/FormComponent/styles.module.scss';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { type SimpleAppSnapshotType } from '../Edit/FormComponent/useSnapshots';

const Edit = ({
  appForm,
  setAppForm,
  setPast
}: {
  appForm: AppFormEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
  setPast: (value: React.SetStateAction<SimpleAppSnapshotType[]>) => void;
}) => {
  const { isPc } = useSystem();
  const [renderEdit, setRenderEdit] = useState(true);

  return (
    <Box
      display={['block', 'flex']}
      flex={'1 0 0'}
      h={0}
      mt={[4, 0]}
      gap={1}
      borderRadius={'lg'}
      overflowY={['auto', 'unset']}
    >
      {renderEdit && (
        <Flex
          className={styles.EditAppBox}
          pr={[0, 1]}
          overflowY={'auto'}
          minW={['auto', '580px']}
          flex={'1'}
          mb={3}
          flexDirection={'column'}
        >
          <Box {...cardStyles} boxShadow={'2'}>
            <AssistantCard />
          </Box>

          <Box mt={4} {...cardStyles} boxShadow={'3.5'} flex={1}>
            <EditForm appForm={appForm} setAppForm={setAppForm} />
          </Box>
        </Flex>
      )}
      {isPc && (
        <Box flex={'2 0 0'} w={0} mb={3}>
          <ChatTest
            appForm={appForm}
            setRenderEdit={setRenderEdit}
            form2WorkflowFn={form2AppWorkflow}
          />
        </Box>
      )}
    </Box>
  );
};

export default React.memo(Edit);
