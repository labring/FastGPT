import { Flex } from '@chakra-ui/react';
import { type PermissionValueType } from '@fastgpt/global/support/permission/type';
import Tag from '@fastgpt/web/components/common/Tag';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { CollaboratorContext } from './context';
import { useTranslation } from 'next-i18next';

export type PermissionTagsProp = {
  permission?: PermissionValueType;
};

function RoleTags({ permission }: PermissionTagsProp) {
  const { getRoleLabelList } = useContextSelector(CollaboratorContext, (v) => v);
  const { t } = useTranslation();

  if (permission === undefined) return null;

  const roleTagList = getRoleLabelList(permission);

  return (
    <Flex gap="2" alignItems="center">
      {roleTagList.map((item) => (
        <Tag
          mixBlendMode={'multiply'}
          key={item}
          colorSchema="blue"
          border="none"
          py={2}
          px={3}
          fontSize={'xs'}
        >
          {t(item as any)}
        </Tag>
      ))}
    </Flex>
  );
}

export default RoleTags;
