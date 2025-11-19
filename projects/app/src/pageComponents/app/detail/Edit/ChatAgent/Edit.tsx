import React, { useState } from 'react';
import { Box } from '@chakra-ui/react';

import ChatTest from '../FormComponent/ChatTest';
import AppCard from '../FormComponent/AppCard';
import EditForm from './EditForm';
import { type AppFormEditFormType } from '@fastgpt/global/core/app/type';
import { cardStyles } from '../../constants';

import styles from '../FormComponent/styles.module.scss';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { type SimpleAppSnapshotType } from '../FormComponent/useSnapshots';
import { agentForm2AppWorkflow } from './utils';

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
        <Box
          className={styles.EditAppBox}
          pr={[0, 1]}
          overflowY={'auto'}
          minW={['auto', '580px']}
          flex={'1'}
        >
          <Box {...cardStyles} boxShadow={'2'}>
            <AppCard appForm={appForm} setPast={setPast} form2WorkflowFn={agentForm2AppWorkflow} />
          </Box>

          <Box mt={4} {...cardStyles} boxShadow={'3.5'}>
            <EditForm appForm={appForm} setAppForm={setAppForm} />
          </Box>
        </Box>
      )}
      {isPc && (
        <Box flex={'2 0 0'} w={0} mb={3}>
          <ChatTest
            appForm={appForm}
            setRenderEdit={setRenderEdit}
            form2WorkflowFn={agentForm2AppWorkflow}
          />
        </Box>
      )}
    </Box>
  );
};

export default React.memo(Edit);
