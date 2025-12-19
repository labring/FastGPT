import React, { useState, useMemo, useCallback } from 'react';
import { Box, Flex } from '@chakra-ui/react';

import ChatTest from './ChatTest';
import AppCard from '../FormComponent/AppCard';
import EditForm from './EditForm';
import type { SkillEditType } from '@fastgpt/global/core/app/formEdit/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { cardStyles } from '../../constants';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { type SimpleAppSnapshotType } from '../FormComponent/useSnapshots';
import { agentForm2AppWorkflow } from './utils';
import styles from '../FormComponent/styles.module.scss';
import dynamic from 'next/dynamic';

const SkillEditForm = dynamic(() => import('./SkillEdit/EditForm'), { ssr: false });
const SKillChatTest = dynamic(() => import('./SkillEdit/ChatTest'), { ssr: false });

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
  // 状态：当前正在编辑的 skill（完整对象）
  const [editingSkill, setEditingSkill] = useState<SkillEditType>();

  // 处理保存
  const handleSaveSkill = useCallback(
    (savedSkill: SkillEditType) => {
      setAppForm((state) => {
        const skillExists = state.skills.some((s) => s.id === savedSkill.id);
        return {
          ...state,
          skills: skillExists
            ? state.skills.map((s) => (s.id === savedSkill.id ? savedSkill : s))
            : [savedSkill, ...state.skills]
        };
      });
      setEditingSkill(undefined);
    },
    [setAppForm]
  );
  const handleAIGenerate = useCallback(
    (updates: Partial<SkillEditType>) => {
      setEditingSkill((prev) => (prev ? { ...prev, ...updates } : prev));
    },
    [setEditingSkill]
  );

  return (
    <Box
      display={['block', 'flex']}
      flex={'1 0 0'}
      h={0}
      mt={[4, 0]}
      gap={1}
      borderRadius={'lg'}
      overflowY={['auto', 'unset']}
      overflowX={'hidden'}
      position={'relative'}
    >
      {/* Top agent editor */}
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

          <Box pb={4}>
            <EditForm appForm={appForm} setAppForm={setAppForm} onEditSkill={setEditingSkill} />
          </Box>
        </Box>
      )}
      {isPc && (
        <Box flex={'2 0 0'} w={0} mb={3}>
          <ChatTest
            appForm={appForm}
            setAppForm={setAppForm}
            setRenderEdit={setRenderEdit}
            form2WorkflowFn={agentForm2AppWorkflow}
          />
        </Box>
      )}

      {/* Mask */}
      {editingSkill && (
        <Box
          position={'absolute'}
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg={'rgba(0, 0, 0, 0.5)'}
          borderRadius={'md'}
          zIndex={9}
        ></Box>
      )}

      {/* Skill editor */}
      <Flex
        position={'absolute'}
        top={0}
        left={0}
        right={0}
        bottom={0}
        bg={'white'}
        borderRadius={'md'}
        zIndex={10}
        transform={editingSkill ? 'translateX(0)' : 'translateX(100%)'}
        transition={'transform 0.3s ease-in-out'}
        pointerEvents={editingSkill ? 'auto' : 'none'}
      >
        {editingSkill && (
          <>
            <Box overflowY={'auto'} minW={['auto', '580px']} flex={'1'} borderRight={'base'}>
              <SkillEditForm
                topAgentSelectedTools={appForm.selectedTools}
                model={appForm.aiSettings.model}
                fileSelectConfig={appForm.chatConfig.fileSelectConfig}
                skill={editingSkill}
                onClose={() => setEditingSkill(undefined)}
                onSave={handleSaveSkill}
              />
            </Box>
            <Box flex={'2 0 0'} w={0} mb={3}>
              <SKillChatTest
                topAgentSelectedTools={appForm.selectedTools}
                skill={editingSkill}
                appForm={appForm}
                onAIGenerate={handleAIGenerate}
              />
            </Box>
          </>
        )}
      </Flex>
    </Box>
  );
};

export default React.memo(Edit);
