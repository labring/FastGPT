import React from 'react';
import { Box } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext, TabEnum } from './context';
import AgentSkillEditor from './config/AgentSkillEditor';
import SkillPreview from './preview/SkillPreview';

const Content = () => {
  const { currentTab, skillId, skillDetail } = useContextSelector(SkillDetailContext, (v) => ({
    currentTab: v.currentTab,
    skillId: v.skillId,
    skillDetail: v.skillDetail
  }));

  const canWrite = Boolean(skillDetail?.permission?.hasWritePer);

  return (
    <Box
      flex={1}
      bg={'white'}
      borderRadius={'8px'}
      border={'1px solid #EBEDF0'}
      overflow={'hidden'}
    >
      {/* Config Tab: AgentSkillEditor 直接读写 MinIO，与 sandbox 状态解耦 */}
      <Box h={'100%'} display={currentTab === TabEnum.config ? 'block' : 'none'}>
        {skillId && <AgentSkillEditor skillId={skillId} canWrite={canWrite} />}
      </Box>
      {/* Preview Tab: 走 session-runtime sandbox（懒初始化，首次发消息触发 warm-up） */}
      <Box h={'100%'} display={currentTab === TabEnum.preview ? 'block' : 'none'}>
        <SkillPreview />
      </Box>
    </Box>
  );
};

export default React.memo(Content);
