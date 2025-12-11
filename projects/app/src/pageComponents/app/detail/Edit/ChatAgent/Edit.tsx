import React, { useState, useMemo } from 'react';
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
  const [editSkill, setEditSkill] = useState<SkillEditType>();

  // 从 appForm.skills 中实时获取最新的 skill 数据
  const currentEditSkill = useMemo(() => {
    if (!editSkill) return undefined;
    return appForm.skills.find((s) => s.id === editSkill.id) || editSkill;
  }, [appForm.skills, editSkill]);

  // 处理编辑 skill 的逻辑:如果是新 skill(不在 appForm.skills 中),先添加到数组
  const handleEditSkill = (skill: SkillEditType) => {
    const existingSkill = appForm.skills.find((s) => s.id === skill.id);
    if (!existingSkill) {
      // 新 skill,添加到 appForm.skills
      setAppForm((state) => ({
        ...state,
        skills: [...state.skills, skill]
      }));
    }
    setEditSkill(skill);
  };

  // 处理关闭 skill 编辑器
  const handleCloseSkillEdit = () => {
    if (editSkill) {
      // 从 appForm.skills 中查找最新的 skill 数据来检查
      const currentSkill = appForm.skills.find((s) => s.id === editSkill.id);
      // 检查这个 skill 是否有实际内容(name 不为空)
      const hasContent = currentSkill?.name && currentSkill.name.trim() !== '';
      if (!hasContent) {
        // 如果没有内容,从 appForm.skills 中移除
        setAppForm((state) => ({
          ...state,
          skills: state.skills.filter((s) => s.id !== editSkill.id)
        }));
      }
    }
    setEditSkill(undefined);
  };

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
            <EditForm appForm={appForm} setAppForm={setAppForm} onEditSkill={handleEditSkill} />
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
      {editSkill && (
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
        transform={editSkill ? 'translateX(0)' : 'translateX(100%)'}
        transition={'transform 0.3s ease-in-out'}
        pointerEvents={editSkill ? 'auto' : 'none'}
      >
        {currentEditSkill && (
          <>
            <Box overflowY={'auto'} minW={['auto', '580px']} flex={'1'} borderRight={'base'}>
              <SkillEditForm
                model={appForm.aiSettings.model}
                fileSelectConfig={appForm.chatConfig.fileSelectConfig}
                defaultSkill={currentEditSkill}
                onClose={handleCloseSkillEdit}
                setAppForm={setAppForm}
              />
            </Box>
            <Box flex={'2 0 0'} w={0} mb={3}>
              <SKillChatTest skill={currentEditSkill} appForm={appForm} setAppForm={setAppForm} />
            </Box>
          </>
        )}
      </Flex>
    </Box>
  );
};

export default React.memo(Edit);
