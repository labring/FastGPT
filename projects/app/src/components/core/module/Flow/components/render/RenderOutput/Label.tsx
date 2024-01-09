import { EditNodeFieldType, FlowNodeOutputItemType } from '@fastgpt/global/core/module/node/type';
import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { onChangeNode } from '../../../FlowProvider';
import MyTooltip from '@/components/MyTooltip';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import SourceHandle from '../SourceHandle';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import dynamic from 'next/dynamic';

const FieldEditModal = dynamic(() => import('../FieldEditModal'));

const OutputLabel = ({
  moduleId,
  outputKey,
  outputs,
  ...item
}: FlowNodeOutputItemType & {
  outputKey: string;
  moduleId: string;
  outputs: FlowNodeOutputItemType[];
}) => {
  const { t } = useTranslation();
  const { label = '', description, edit } = item;
  const [editField, setEditField] = useState<EditNodeFieldType>();

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
            name={'common/settingLight'}
            w={'14px'}
            cursor={'pointer'}
            mr={3}
            _hover={{ color: 'primary.500' }}
            onClick={() =>
              setEditField({
                key: outputKey,
                label: item.label,
                description: item.description,
                valueType: item.valueType,
                outputType: item.type
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
        <SourceHandle handleKey={outputKey} valueType={item.valueType} />
      )}

      {!!editField && (
        <FieldEditModal
          editField={item.editField}
          defaultField={editField}
          keys={[outputKey]}
          onClose={() => setEditField(undefined)}
          onSubmit={({ data, changeKey }) => {
            if (!data.outputType || !data.key) return;

            const newOutput: FlowNodeOutputItemType = {
              ...item,
              type: data.outputType,
              valueType: data.valueType,
              key: data.key,
              label: data.label,
              description: data.description
            };

            if (changeKey) {
              onChangeNode({
                moduleId,
                type: 'replaceOutput',
                key: editField.key,
                value: newOutput
              });
            } else {
              onChangeNode({
                moduleId,
                type: 'updateOutput',
                key: newOutput.key,
                value: newOutput
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
