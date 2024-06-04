import { Box, BoxProps } from '@chakra-ui/react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useTranslation } from 'next-i18next';
import React from 'react';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';

export enum defaultPermissionEnum {
  private = 'private',
  read = 'read',
  edit = 'edit'
}

type Props = Omit<BoxProps, 'onChange'> & {
  per: PermissionValueType;
  defaultPer: PermissionValueType;
  readPer: PermissionValueType;
  writePer: PermissionValueType;
  onChange: (v: PermissionValueType) => void;
};

const DefaultPermissionList = ({
  per,
  defaultPer,
  readPer,
  writePer,
  onChange,
  ...styles
}: Props) => {
  const { t } = useTranslation();
  const defaultPermissionSelectList = [
    { label: '仅协作者访问', value: defaultPer },
    { label: '团队可访问', value: readPer },
    { label: '团队可编辑', value: writePer }
  ];

  return (
    <Box {...styles}>
      <MySelect
        list={defaultPermissionSelectList}
        value={per}
        onchange={(v) => {
          onChange(v);
        }}
      />
    </Box>
  );
};

export default DefaultPermissionList;
