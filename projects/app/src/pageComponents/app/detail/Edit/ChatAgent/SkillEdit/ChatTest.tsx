import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useMemo, useRef } from 'react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { SkillEditType, SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import MyBox from '@fastgpt/web/components/common/MyBox';
import HelperBot from '@/components/core/chat/HelperBot';
import { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';
import { loadGeneratedTools } from '../utils';
import type { HelperBotRefType } from '@/components/core/chat/HelperBot/context';

type Props = {
  topAgentSelectedTools?: SelectedToolItemType[];
  skill: SkillEditType;
  appForm: AppFormEditFormType;
  onAIGenerate: (updates: Partial<SkillEditType>) => void;
};
const ChatTest = ({ topAgentSelectedTools = [], skill, appForm, onAIGenerate }: Props) => {
  const { t } = useTranslation();
  const ChatBoxRef = useRef<HelperBotRefType>(null);

  const skillAgentMetadata = useMemo(() => {
    return {
      skillAgent: {
        name: skill.name,
        description: skill.description,
        stepsText: skill.stepsText
      },
      topAgent: {
        role: appForm.aiSettings.aiRole,
        taskObject: appForm.aiSettings.aiTaskObject,
        fileUpload: appForm.chatConfig.fileSelectConfig?.canSelectFile || false,
        selectedTools: skill.selectedTools?.map((tool) => tool.id) || [],
        selectedDatasets: skill.dataset?.list?.map((ds) => ds.datasetId) || []
      }
    };
  }, [appForm.aiSettings, appForm.chatConfig.fileSelectConfig, skill]);

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
              ChatBoxRef.current?.restartChat();
            }}
          />
        </MyTooltip>
      </Flex>
      <Box flex={1}>
        <HelperBot
          ChatBoxRef={ChatBoxRef}
          type={HelperBotTypeEnum.skillAgent}
          metadata={skillAgentMetadata}
          onApply={async (generatedSkillData) => {
            console.log(generatedSkillData, 222);

            // 1. 计算新的 tool
            const newToolIds: string[] = [];
            generatedSkillData.execution_plan.steps.forEach((step) => {
              step.expectedTools?.forEach((tool) => {
                if (tool.type === 'tool') {
                  const exists = skill.selectedTools.find((t) => t.pluginId === tool.id);
                  if (exists) return;
                  newToolIds.push(tool.id);
                }
              });
            });

            // 3. 并行获取新工具详情
            const newTools = await loadGeneratedTools({
              newToolIds,
              existsTools: skill.selectedTools,
              topAgentSelectedTools,
              fileSelectConfig: appForm.chatConfig.fileSelectConfig
            });

            // 4. 构建 stepsText
            const stepsText = generatedSkillData.execution_plan.steps
              .map((step, index) => {
                let stepText = `步骤 ${index + 1}: ${step.title}\n${step.description}`;
                if (step.expectedTools && step.expectedTools.length > 0) {
                  const tools = step.expectedTools
                    .map((tool) => `${tool.type === 'tool' ? '🔧' : '📚'} ${tool.id}`)
                    .join(', ');
                  stepText += `\n使用工具: ${tools}`;
                }
                return stepText;
              })
              .join('\n\n');

            // 5. 应用生成的数据，以 AI 生成的工具列表为准
            onAIGenerate({
              name: generatedSkillData.plan_analysis.name || skill.name,
              description: generatedSkillData.plan_analysis.description || skill.description,
              stepsText: stepsText,
              selectedTools: newTools
            });
          }}
        />
      </Box>
    </MyBox>
  );
};

export default React.memo(ChatTest);
