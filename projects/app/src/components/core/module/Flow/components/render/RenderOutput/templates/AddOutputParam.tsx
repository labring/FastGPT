import React from 'react';
import type { RenderOutputProps } from '../type';
import { onChangeNode } from '../../../../FlowProvider';
import { Box, Button } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import { useTranslation } from 'next-i18next';
import { customAlphabet } from 'nanoid';
import { ModuleDataTypeEnum } from '@fastgpt/global/core/module/constants';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/module/node/constant';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);

const AddOutputParam = ({ outputs = [], moduleId }: RenderOutputProps) => {
  const { t } = useTranslation();

  return (
    <Box textAlign={'right'}>
      <Button
        variant={'base'}
        leftIcon={<SmallAddIcon />}
        onClick={() => {
          onChangeNode({
            moduleId,
            type: 'addOutput',
            value: {
              key: nanoid(),
              label: t('core.module.output.Output Number', { length: outputs.length - 1 }),
              valueType: ModuleDataTypeEnum.string,
              type: FlowNodeOutputTypeEnum.source,
              edit: true,
              targets: []
            }
          });
        }}
      >
        {t('core.module.output.Add Output')}
      </Button>
    </Box>
  );
};

export default React.memo(AddOutputParam);
