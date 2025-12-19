import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useMemo } from 'react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { SkillEditType, SelectedToolItemType } from '@fastgpt/global/core/app/formEdit/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import MyBox from '@fastgpt/web/components/common/MyBox';
import HelperBot from '@/components/core/chat/HelperBot';
import { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';
import { getToolPreviewNode } from '@/web/core/app/api/tool';
import {
  validateToolConfiguration,
  getToolConfigStatus
} from '@fastgpt/global/core/app/formEdit/utils';

type Props = {
  topAgentSelectedTools?: SelectedToolItemType[];
  skill: SkillEditType;
  appForm: AppFormEditFormType;
  onAIGenerate: (updates: Partial<SkillEditType>) => void;
};
const ChatTest = ({ topAgentSelectedTools = [], skill, appForm, onAIGenerate }: Props) => {
  const { t } = useTranslation();

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
            }}
          />
        </MyTooltip>
      </Flex>
      <Box flex={1}>
        <HelperBot
          type={HelperBotTypeEnum.skillAgent}
          metadata={skillAgentMetadata}
          onApply={async (generatedSkillData) => {
            console.log(generatedSkillData, 222);

            // 1. 提取所有步骤中的工具 ID（去重，仅保留 type='tool'）
            const allToolIds = new Set<string>();
            generatedSkillData.execution_plan.steps.forEach((step) => {
              step.expectedTools?.forEach((tool) => {
                if (
                  tool.type === 'tool' &&
                  !skill.selectedTools.find((t) => t.pluginId === tool.id)
                ) {
                  allToolIds.add(tool.id);
                }
              });
            });

            // 2. 并行获取工具详情
            const targetToolIds = Array.from(allToolIds);
            const newTools: SelectedToolItemType[] = [];

            if (targetToolIds.length > 0) {
              const results = await Promise.all(
                targetToolIds.map((toolId: string) =>
                  getToolPreviewNode({ appId: toolId })
                    .then((tool) => ({ status: 'fulfilled' as const, toolId, tool }))
                    .catch((error) => ({ status: 'rejected' as const, toolId, error }))
                )
              );

              results.forEach((result) => {
                if (result.status !== 'fulfilled') return;
                const tool = result.tool;
                // 验证工具配置
                const toolValid = validateToolConfiguration({
                  toolTemplate: tool,
                  canSelectFile: appForm.chatConfig.fileSelectConfig?.canSelectFile,
                  canSelectImg: appForm.chatConfig.fileSelectConfig?.canSelectImg
                });

                if (toolValid) {
                  // 添加与 top 相同工具的配置
                  const topTool = topAgentSelectedTools.find(
                    (item) => item.pluginId === tool.pluginId
                  );
                  if (topTool) {
                    tool.inputs.forEach((input) => {
                      const topInput = topTool.inputs.find((input) => input.key === input.key);
                      if (topInput) {
                        input.value = topInput.value;
                      }
                    });
                  }

                  newTools.push({
                    ...tool,
                    configStatus: getToolConfigStatus(tool).status
                  });
                }
              });
            }

            // 3. 构建 stepsText（保持原有逻辑）
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

            // 4. 应用生成的数据，包含 selectedTools
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
