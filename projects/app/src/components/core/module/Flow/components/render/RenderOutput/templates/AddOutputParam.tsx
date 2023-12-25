import React, { useState } from 'react';
import type { RenderOutputProps } from '../type';
import { onChangeNode } from '../../../../FlowProvider';
import { Box, Button } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';
import { useTranslation } from 'next-i18next';

import dynamic from 'next/dynamic';
import { EditNodeFieldType } from '@fastgpt/global/core/module/node/type';

const FieldEditModal = dynamic(() => import('../../FieldEditModal'));

const AddOutputParam = ({ outputs = [], item, moduleId }: RenderOutputProps) => {
  const { t } = useTranslation();
  const [editField, setEditField] = useState<EditNodeFieldType>();

  return (
    <Box textAlign={'right'}>
      <Button
        variant={'whitePrimary'}
        leftIcon={<SmallAddIcon />}
        onClick={() => {
          setEditField(item.defaultEditField || {});
        }}
      >
        {t('core.module.output.Add Output')}
      </Button>
      {!!editField && (
        <FieldEditModal
          editField={item.editField}
          defaultField={editField}
          keys={outputs.map((output) => output.key)}
          onClose={() => setEditField(undefined)}
          onSubmit={({ data }) => {
            onChangeNode({
              moduleId,
              type: 'addOutput',
              key: data.key,
              value: {
                type: data.outputType,
                valueType: data.valueType,
                key: data.key,
                label: data.label,
                description: data.description,
                required: data.required,
                edit: true,
                editField: item.editField,
                targets: []
              }
            });
            setEditField(undefined);
          }}
        />
      )}
    </Box>
  );
};

export default React.memo(AddOutputParam);
