import React from 'react';
import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useWorkflowInitialLoadFailed } from '@/web/core/workflow/editor/session/workflowSession';
import { AppContext } from '../../context';
import WorkflowCanvas from './canvas/WorkflowCanvas';
import { useWorkflowModalValue } from './panels/workflowPanelState';

const ImportSettings = dynamic(() => import('./ImportSettings'));

const WorkflowLoadFailure = () => {
  const { t } = useTranslation();
  const openPanel = useWorkflowModalValue((value) => value.openPanel);
  const canEdit = useContextSelector(
    AppContext,
    (value) => value.appDetail.permission?.hasWritePer
  );
  const { isOpen, onOpen, onClose } = useDisclosure();

  return (
    <Flex flex={1} align="center" justify="center" direction="column" gap={3}>
      <Box role="alert">{t('common:load_failed')}</Box>
      <Flex gap={2}>
        <Button variant="whiteBase" onClick={() => openPanel('history')}>
          {t('common:core.chat.History')}
        </Button>
        {canEdit && (
          <Button variant="whiteBase" onClick={onOpen}>
            {t('app:import_configs')}
          </Button>
        )}
      </Flex>
      {isOpen && <ImportSettings onClose={onClose} />}
    </Flex>
  );
};

const Flow = () => {
  const initialLoadFailed = useWorkflowInitialLoadFailed();
  return initialLoadFailed ? <WorkflowLoadFailure /> : <WorkflowCanvas />;
};

export default React.memo(Flow);
