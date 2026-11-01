import React, { useCallback } from 'react';
import { Box, Button, Grid, HStack, useDisclosure } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import type { RenderInputProps } from '../render/RenderInput/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyTag from '@fastgpt/web/components/common/Tag';
import { getSelectedInputRenderType } from '@fastgpt/global/common/workflow/reference';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import OptimizerPopover from '@/components/common/PromptEditor/OptimizerPopover';
import { AgentSkillCardList } from '@/components/core/app/SkillCard';
import SelectedToolCardList from '@/components/core/app/SelectedToolCardList';
import { useAgentNodeInputContext } from './context';

const PromptEditor = dynamic(() => import('@fastgpt/web/components/common/Textarea/PromptEditor'));
const SkillSelectModal = dynamic(
  () => import('@/pageComponents/app/detail/Edit/FormComponent/ToolSelector/SkillSelectModal')
);
const ToolSelectModal = dynamic(
  () => import('@/pageComponents/app/detail/Edit/FormComponent/ToolSelector/ToolSelectModal')
);

export const chooseButtonTooltipProps = {
  offset: [0, 8] as [number, number],
  px: 3,
  py: 2,
  fontSize: 'xs',
  borderRadius: 'md',
  arrowSize: 8,
  boxShadow: '0px 2px 4px 0px rgba(161, 167, 179, 0.25), 0px 0px 1px 0px rgba(121, 141, 159, 0.25)',
  shouldWrapChildren: false
} as const;

/** 标准输入标题右侧只补 Agent 提示，来源切换仍由 InputLabel 负责。 */
export const AgentPromptLabel = ({ item }: RenderInputProps) => {
  const { t } = useTranslation();
  if (getSelectedInputRenderType(item) !== FlowNodeInputTypeEnum.textarea) return null;
  return (
    <HStack fontSize={'xs'} fontWeight={'medium'} spacing={1} color={'myGray.500'}>
      <MyIcon name={'infoRounded'} w={'16px'} color={'myGray.500'} />
      <Box>{t('workflow:agent.prompt_skill_tip')}</Box>
    </HStack>
  );
};

/** Agent 提示词复用共享资源管理器，引用及 AI 生成态由 RenderInput 优先处理。 */
export const AgentPromptInput = ({ item }: Pick<RenderInputProps, 'item'>) => {
  const { t } = useTranslation();
  const { onPromptChange, editorVariables, allVariables, skillManager } =
    useAgentNodeInputContext();
  const { skillOption, selectedSkills, onClickSkill } = skillManager;
  const Optimizer = useCallback(
    ({ iconButtonStyle }: { iconButtonStyle: Record<string, any> }) => (
      <OptimizerPopover
        iconButtonStyle={iconButtonStyle}
        defaultPrompt={item.value}
        onChangeText={onPromptChange}
      />
    ),
    [item.value, onPromptChange]
  );
  return (
    <PromptEditor
      minH={140}
      bg={'white'}
      title={t('common:core.ai.Prompt')}
      isRichText
      showOpenModal
      value={item.value ?? ''}
      onChange={onPromptChange}
      variables={allVariables}
      variableLabels={editorVariables}
      skillOption={skillOption}
      selectedSkills={selectedSkills}
      onClickSkill={onClickSkill}
      ExtensionPopover={[Optimizer]}
      placeholder={t('workflow:agent.prompt_placeholder')}
    />
  );
};

export const AgentSkillsLabel = () => {
  const { t } = useTranslation();
  const { skillSelection } = useAgentNodeInputContext();
  return skillSelection.isAgentSkillSandboxUnavailable ? (
    <MyTag
      colorSchema={'red'}
      type={'borderFill'}
      cursor={'pointer'}
      onClick={skillSelection.openSkillSelect}
    >
      {t('skill:sandbox_unavailable_tag')}
    </MyTag>
  ) : null;
};

/** 技能模板只负责列表与选择弹窗，沙盒约束统一交给共享 Hook。 */
export const AgentSkillsInput = () => {
  const { t } = useTranslation();
  const { selectedAgentSkills, skillSelection } = useAgentNodeInputContext();
  return (
    <>
      <Grid gridTemplateColumns={'repeat(2, minmax(0, 1fr))'} gridGap={3} minW={'350px'} w={'100%'}>
        <MyTooltip label={t('workflow:agent.select_skill')} {...chooseButtonTooltipProps}>
          <Button
            variant={'primaryOutline'}
            h={10}
            w={'100%'}
            leftIcon={<MyIcon name={'common/selectLight'} w={'14px'} />}
            onClick={skillSelection.openSkillSelect}
          >
            {t('common:Choose')}
          </Button>
        </MyTooltip>
        <AgentSkillCardList
          skills={selectedAgentSkills}
          onDelete={skillSelection.onRemoveAgentSkill}
          compact
        />
      </Grid>
      {skillSelection.isOpenSkillSelect && (
        <SkillSelectModal
          selectedSkills={selectedAgentSkills}
          onAddSkill={skillSelection.onAddAgentSkill}
          onRemoveSkill={skillSelection.onRemoveAgentSkill}
          onClose={skillSelection.onCloseSkillSelect}
        />
      )}
    </>
  );
};

/** 工具模板复用表单卡片与配置弹窗，列表状态始终由工具输入即时推导。 */
export const AgentToolsInput = () => {
  const { t } = useTranslation();
  const { selectedTools, canUploadFile, onUpdateOrAddTool, onDeleteTool, skillManager } =
    useAgentNodeInputContext();
  const { isOpen, onOpen, onClose } = useDisclosure();
  return (
    <>
      <Grid gridTemplateColumns={'repeat(2, minmax(0, 1fr))'} gridGap={3} minW={'350px'} w={'100%'}>
        <MyTooltip label={t('workflow:agent.select_tool')} {...chooseButtonTooltipProps}>
          <Button
            variant={'primaryOutline'}
            h={10}
            w={'100%'}
            leftIcon={<MyIcon name={'common/selectLight'} w={'14px'} />}
            onClick={onOpen}
          >
            {t('common:Choose')}
          </Button>
        </MyTooltip>
        <SelectedToolCardList
          selectedTools={selectedTools}
          onConfigTool={skillManager.onOpenConfigTool}
          onRemoveTool={onDeleteTool}
          compact
        />
      </Grid>
      {isOpen && (
        <ToolSelectModal
          selectedTools={selectedTools}
          fileSelectConfig={canUploadFile ? { canSelectFile: true } : {}}
          onAddTool={onUpdateOrAddTool}
          onRemoveTool={(tool) => onDeleteTool(tool.id, tool.source)}
          onClose={onClose}
        />
      )}
    </>
  );
};
