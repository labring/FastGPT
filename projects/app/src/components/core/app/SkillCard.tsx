import React from 'react';
import { type FlexProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import FormResourceCard from './FormResourceCard';

type SkillCardProps = {
  skill: SelectedAgentSkillItemType;
  onDelete?: (skillId: string) => void;
  flexProps?: FlexProps;
  avatarSize?: string;
  nameFontWeight?: string;
  compact?: boolean;
};

/**
 * 单个已选技能卡片，统一展示技能删除态、无权限态与删除操作。
 */
const SkillCard = React.memo(function SkillCard({
  skill,
  onDelete,
  flexProps,
  avatarSize,
  nameFontWeight,
  compact = false
}: SkillCardProps) {
  const { t } = useTranslation();
  const hasError = !!skill.error;
  const resolvedAvatarSize = avatarSize || (compact ? '18px' : '1.5rem');

  const errorText = (() => {
    if (skill.error === 'resource_no_permission') {
      return t('common:core.workflow.check.resource_no_permission');
    }
    if (skill.error) {
      return t('skill:skill_deleted');
    }
    return '';
  })();

  const tooltipLabel = (() => {
    if (skill.error === 'resource_no_permission') {
      return t('common:core.workflow.check.resource_no_permission');
    }
    if (skill.error) {
      return t('skill:skill_deleted_click_remove_tip');
    }
    return skill.description;
  })();

  return (
    <FormResourceCard
      compact={compact}
      avatar={
        skill.avatar ? (
          <Avatar
            src={skill.avatar}
            w={resolvedAvatarSize}
            h={resolvedAvatarSize}
            borderRadius={'sm'}
          />
        ) : (
          <MyIcon name={'core/skill/default'} w={resolvedAvatarSize} h={resolvedAvatarSize} />
        )
      }
      name={skill.name}
      nameFontWeight={nameFontWeight}
      isUnavailable={hasError}
      tooltipLabel={tooltipLabel}
      showTooltipOnlyWhenOverflow={!hasError && !skill.description}
      errorText={errorText}
      flexProps={compact ? flexProps : { p: 2.5, ...flexProps }}
      actions={
        onDelete ? (
          <MyIconButton
            icon="delete"
            hoverBg="red.50"
            hoverColor="red.600"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(skill.skillId);
            }}
          />
        ) : undefined
      }
    />
  );
});

/** 已选技能列表的共同入口；紧凑样式用于工作流节点，错误态和删除行为保持一致。 */
export const AgentSkillCardList = ({
  skills,
  onDelete,
  compact = false
}: {
  skills: SelectedAgentSkillItemType[];
  onDelete: (skillId: string) => void;
  compact?: boolean;
}) => (
  <>
    {skills.map((skill) => (
      <SkillCard key={skill.skillId} skill={skill} onDelete={onDelete} compact={compact} />
    ))}
  </>
);

export default SkillCard;
