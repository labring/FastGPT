import { Box, BoxProps } from '@chakra-ui/react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import React from 'react';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useI18n } from '@/web/context/I18n';

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
  isInheritPermission?: boolean;
  hasParent?: boolean;
};

const DefaultPermissionList = ({
  per,
  defaultPer,
  readPer = ReadPermissionVal,
  writePer = WritePermissionVal,
  onChange,
  isInheritPermission = false,
  hasParent,
  ...styles
}: Props) => {
  const { ConfirmModal, openConfirm } = useConfirm({});
  const { commonT } = useI18n();

  const defaultPermissionSelectList = [
    { label: '仅协作者访问', value: defaultPer },
    { label: '团队可访问', value: readPer },
    { label: '团队可编辑', value: writePer }
  ];

  const { runAsync: onRequestChange, loading } = useRequest2((v: PermissionValueType) =>
    onChange(v)
  );

  return (
    <>
      <Box {...styles}>
        <MySelect
          isLoading={loading}
          list={defaultPermissionSelectList}
          value={per}
          onchange={(per) => {
            if (isInheritPermission && hasParent) {
              openConfirm(
                () => onRequestChange(per),
                undefined,
                commonT('permission.Remove InheritPermission Confirm')
              )();
            } else {
              return onRequestChange(per);
            }
          }}
        />
      </Box>
      <ConfirmModal />
    </>
  );
};

export default DefaultPermissionList;
