import React from 'react';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';

type SkillCardProps = {
  skill: SelectedAgentSkillItemType;
  onDelete?: (skillId: string) => void;
  flexProps?: FlexProps;
  avatarSize?: string;
  nameFontWeight?: string;
};

const formCardShadow = '0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)';

const cardProps: FlexProps = {
  w: '100%',
  minW: 0,
  maxW: '100%',
  p: 2.5,
  bg: 'white',
  boxShadow: formCardShadow,
  borderRadius: 'md',
  border: 'base'
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
  const isUnavailable = hasError;

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
    <MyTooltip label={tooltipLabel} showOnlyWhenOverflow={!hasError}>
      <Flex
        overflow={'hidden'}
        alignItems={'center'}
        userSelect={'none'}
        {...cardProps}
        {...flexProps}
        border={flexProps?.border || cardProps.border}
        borderColor={isUnavailable ? 'red.600' : flexProps?.borderColor}
        _hover={{
          ...flexProps?._hover,
          borderColor: isUnavailable ? 'red.600' : 'primary.300',
          '& .skill-card-delete': {
            display: 'flex'
          },
          '& .unHoverStyle': {
            display: onDelete ? 'none' : undefined
          }
        }}
      >
        {skill.avatar ? (
          <Avatar src={skill.avatar} w={avatarSize} h={avatarSize} borderRadius={'sm'} />
        ) : (
          <MyIcon name={'core/skill/default'} w={avatarSize} h={avatarSize} />
        )}
        <Box
          ml={2}
          flex={'1 0 0'}
          w={0}
          minW={0}
          className={'textEllipsis'}
          fontSize={'sm'}
          fontWeight={nameFontWeight}
          color={isUnavailable ? 'red.600' : 'myGray.900'}
        >
          {skill.name}
        </Box>

        {errorText && (
          <MyTag colorSchema="red" type="fill" className="unHoverStyle" flexShrink={0}>
            <MyIcon name={'common/error'} w={'14px'} mr={1} />
            <MyTooltip label={errorText} showOnlyWhenOverflow>
              <Box color={'red.600'} maxW={'150px'} className="textEllipsis">
                {errorText}
              </Box>
            </MyTooltip>
          </MyTag>
        )}

        {onDelete && (
          <Box className="skill-card-delete" display={['flex', 'none']} ml={0.5}>
            <MyIconButton
              icon="delete"
              hoverBg="red.50"
              hoverColor="red.600"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(skill.skillId);
              }}
            />
          </Box>
        )}
      </Flex>
    </MyTooltip>
  );
});

export default SkillCard;
