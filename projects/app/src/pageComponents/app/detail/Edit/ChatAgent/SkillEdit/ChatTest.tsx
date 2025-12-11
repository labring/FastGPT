import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useMemo } from 'react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { SkillEditType } from '@fastgpt/global/core/app/formEdit/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../../context';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { cardStyles } from '../../../constants';
import HelperBot from '@/components/core/chat/HelperBot';
import { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';
import { useToast } from '@fastgpt/web/hooks/useToast';

type Props = {
  skill: SkillEditType;
  appForm: AppFormEditFormType;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
};
const ChatTest = ({ skill, appForm, setAppForm }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  // 构建 SkillAgent metadata
  // 使用 useMemo 确保 metadata 响应 appForm 的变化
  const skillAgentMetadata = useMemo(() => {
    // 从 appForm.skills 中找到当前正在编辑的 skill (通过 id 匹配)
    const currentSkill = appForm.skills.find((s) => s.id === skill.id) || skill;
    return {
      skillAgent: {
        name: currentSkill.name,
        description: currentSkill.description,
        prompt: currentSkill.prompt
      },
      topAgent: {
        role: appForm.aiSettings.aiRole,
        taskObject: appForm.aiSettings.aiTaskObject,
        fileUpload: appForm.chatConfig.fileSelectConfig?.canSelectFile || false,
        selectedTools: currentSkill.selectedTools?.map((tool) => tool.id) || [],
        selectedDatasets: currentSkill.dataset?.list?.map((ds) => ds.datasetId) || []
      }
    };
  }, [appForm, skill]);

  return (
    <MyBox display={'flex'} position={'relative'} flexDirection={'column'} h={'full'} py={4}>
      <Flex px={[2, 5]} pb={2}>
        <Box color={'myGray.900'} fontWeight={'bold'} fontSize={'lg'} flex={1}>
          {t('app:skill_editor')}
        </Box>
        <MyTooltip label={t('common:core.chat.Restart')}>
          <IconButton
            className="chat"
            size={'smSquare'}
            icon={<MyIcon name={'common/clearLight'} w={'14px'} />}
            variant={'whiteDanger'}
            borderRadius={'md'}
            aria-label={'delete'}
            onClick={(e) => {
              e.stopPropagation();
            }}
          />
        </MyTooltip>
      </Flex>
      <Box flex={1}>
        <HelperBot
          type={HelperBotTypeEnum.skillAgent}
          metadata={skillAgentMetadata}
          onApply={(generatedSkillData) => {
            console.log('📝 ChatTest onApply - Received generated skill data:', generatedSkillData);
            console.log('📝 Current skill id:', skill.id);

            // 检查是否是 generatedSkill 类型
            if (!generatedSkillData.plan_analysis || !generatedSkillData.execution_plan) {
              console.warn('❌ Invalid generated skill data format');
              return;
            }

            // 将生成的 skill 数据填充到 appForm.skills 中
            setAppForm((state) => {
              console.log('📝 Before update - appForm.skills:', state.skills);
              const updatedSkills = state.skills.map((s) => {
                if (s.id === skill.id) {
                  const updatedSkill = {
                    ...s,
                    name: generatedSkillData.plan_analysis.name || s.name,
                    description: generatedSkillData.plan_analysis.description || s.description,
                    steps: generatedSkillData.execution_plan.steps
                  };
                  console.log('✅ Updated skill:', updatedSkill);
                  return updatedSkill;
                }
                return s;
              });
              console.log('📝 After update - appForm.skills:', updatedSkills);
              return {
                ...state,
                skills: updatedSkills
              };
            });

            toast({
              title: t('chat:generated_skill.applied_success'),
              status: 'success'
            });
          }}
        />
      </Box>
    </MyBox>
  );
};

export default React.memo(ChatTest);
