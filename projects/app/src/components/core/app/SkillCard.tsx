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
};

/**
 * 单个已选技能卡片，统一展示技能删除态、无权限态与删除操作。
 */
const SkillCard = React.memo(function SkillCard({
  skill,
  onDelete,
  flexProps,
  avatarSize = '1.5rem',
  nameFontWeight
}: SkillCardProps) {
  const { t } = useTranslation();
  const hasError = !!skill.error;

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
      avatar={
        skill.avatar ? (
          <Avatar src={skill.avatar} w={avatarSize} h={avatarSize} borderRadius={'sm'} />
        ) : (
          <MyIcon name={'core/skill/default'} w={avatarSize} h={avatarSize} />
        )
      }
      name={skill.name}
      nameFontWeight={nameFontWeight}
      isUnavailable={hasError}
      tooltipLabel={tooltipLabel}
      errorText={errorText}
      flexProps={{ p: 2.5, ...flexProps }}
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

export default SkillCard;
