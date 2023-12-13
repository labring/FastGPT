import { FlowNodeOutputItemType } from '@fastgpt/global/core/module/node/type';
import React, { useState } from 'react';
import FieldEditModal, { EditFieldModeType, EditFieldType } from '../../modules/FieldEditModal';
import { useTranslation } from 'next-i18next';
import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@/components/Icon';
import { onChangeNode } from '../../../FlowProvider';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import SourceHandle from '../SourceHandle';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/module/node/constant';

const OutputLabel = ({
  moduleId,
  outputKey,
  outputs,
  editFiledType = 'output',
  ...item
}: FlowNodeOutputItemType & {
  outputKey: string;
  moduleId: string;
  outputs: FlowNodeOutputItemType[];
  editFiledType?: EditFieldModeType;
}) => {
  const { t } = useTranslation();
  const { label = '', description, edit } = item;
  const [editField, setEditField] = useState<EditFieldType>();

  return (
    <Flex
      className="nodrag"
      cursor={'default'}
      justifyContent={'right'}
      alignItems={'center'}
      position={'relative'}
    >
      {edit && (
        <>
          <MyIcon
            name={'settingLight'}
            w={'14px'}
            cursor={'pointer'}
            mr={3}
            _hover={{ color: 'myBlue.600' }}
            onClick={() =>
              setEditField({
                label: item.label,
                valueType: item.valueType,
                key: outputKey,
                description: item.description
              })
            }
          />
          <MyIcon
            className="delete"
            name={'delete'}
            w={'14px'}
            cursor={'pointer'}
            mr={3}
            _hover={{ color: 'red.500' }}
            onClick={() => {
              onChangeNode({
                moduleId,
                type: 'delOutput',
                key: outputKey
              });
            }}
          />
        </>
      )}
      {description && (
        <MyTooltip label={t(description)} forceShow>
          <QuestionOutlineIcon display={['none', 'inline']} mr={1} />
        </MyTooltip>
      )}
      <Box>{t(label)}</Box>

      {item.type === FlowNodeOutputTypeEnum.source && (
        <SourceHandle handleKey={item.key} valueType={item.valueType} />
      )}

      {!!editField && (
        <FieldEditModal
          mode={editFiledType}
          defaultField={editField}
          onClose={() => setEditField(undefined)}
          onSubmit={(e) => {
            const data = {
              ...item,
              ...e
            };
            if (editField.key === data.key) {
              onChangeNode({
                moduleId,
                type: 'updateOutput',
                key: data.key,
                value: data
              });
            } else {
              onChangeNode({
                moduleId,
                type: 'replaceOutput',
                key: editField.key,
                value: data
              });
            }

            setEditField(undefined);
          }}
        />
      )}
    </Flex>
  );
};

export default React.memo(OutputLabel);
