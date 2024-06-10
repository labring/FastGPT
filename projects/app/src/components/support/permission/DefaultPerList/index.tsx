import { Box, BoxProps } from '@chakra-ui/react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useTranslation } from 'next-i18next';
import React from 'react';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

export enum defaultPermissionEnum {
  private = 'private',
  read = 'read',
  edit = 'edit'
}

type Props = Omit<BoxProps, 'onChange'> & {
  per: PermissionValueType;
  defaultPer: PermissionValueType;
  readPer?: PermissionValueType;
  writePer?: PermissionValueType;
  onChange: (v: PermissionValueType) => Promise<any> | any;
};

const DefaultPermissionList = ({
  per,
  defaultPer,
  readPer = ReadPermissionVal,
  writePer = WritePermissionVal,
  onChange,
  ...styles
}: Props) => {
  const { t } = useTranslation();
  const defaultPermissionSelectList = [
    { label: '仅协作者访问', value: defaultPer },
    { label: '团队可访问', value: readPer },
    { label: '团队可编辑', value: writePer }
  ];

  const { runAsync: onRequestChange, loading } = useRequest2(async (v: PermissionValueType) =>
    onChange(v)
  );

  return (
    <Box {...styles}>
      <MySelect
        isLoading={loading}
        list={defaultPermissionSelectList}
        value={per}
        onchange={onRequestChange}
      />
    </Box>
  );
};

export default DefaultPermissionList;
