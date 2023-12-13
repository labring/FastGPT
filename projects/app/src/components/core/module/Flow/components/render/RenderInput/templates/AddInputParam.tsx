import React from 'react';
import type { RenderInputProps } from '../type';
import { onChangeNode } from '../../../../FlowProvider';
import { Button } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import { useTranslation } from 'next-i18next';
import { customAlphabet } from 'nanoid';
import { ModuleDataTypeEnum } from '@fastgpt/global/core/module/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/module/node/constant';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);

const AddInputParam = ({ inputs = [], moduleId }: RenderInputProps) => {
  const { t } = useTranslation();

  return (
    <Button
      variant={'base'}
      leftIcon={<SmallAddIcon />}
      onClick={() => {
        const key = nanoid();
        onChangeNode({
          moduleId,
          type: 'addInput',
          key,
          value: {
            key,
            valueType: ModuleDataTypeEnum.string,
            type: FlowNodeInputTypeEnum.target,
            label: t('core.module.input.Input Number', { length: inputs.length - 1 }),
            edit: true
          }
        });
      }}
    >
      {t('core.module.input.Add Input')}
    </Button>
  );
};

export default React.memo(AddInputParam);
