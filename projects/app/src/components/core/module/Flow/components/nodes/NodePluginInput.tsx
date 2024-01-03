import React, { useState } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import { onChangeNode } from '../../FlowProvider';
import dynamic from 'next/dynamic';
import { Box, Button, Flex } from '@chakra-ui/react';
import { QuestionOutlineIcon, SmallAddIcon } from '@chakra-ui/icons';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/module/node/constant';
import Container from '../modules/Container';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@/components/MyTooltip';
import SourceHandle from '../render/SourceHandle';
import type {
  EditNodeFieldType,
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/module/node/type.d';
import { ModuleIOValueTypeEnum } from '@fastgpt/global/core/module/constants';
import { useTranslation } from 'next-i18next';

const FieldEditModal = dynamic(() => import('../render/FieldEditModal'));

const defaultCreateField: EditNodeFieldType = {
  label: '',
  key: '',
  description: '',
  inputType: FlowNodeInputTypeEnum.target,
  valueType: ModuleIOValueTypeEnum.string,
  required: true
};
const createEditField = {
  key: true,
  name: true,
  description: true,
  required: true,
  dataType: true,
  inputType: true
};

const NodePluginInput = React.memo(function NodePluginInput({
  data
}: {
  data: FlowModuleItemType;
}) {
  const { t } = useTranslation();
  const { moduleId, inputs, outputs } = data;
  const [createField, setCreateField] = useState<EditNodeFieldType>();
  const [editField, setEditField] = useState<EditNodeFieldType>();

  return (
    <NodeCard minW={'300px'} {...data}>
      <Container mt={1} borderTop={'2px solid'} borderTopColor={'myGray.300'}>
        {inputs.map((item) => (
          <Flex
            key={item.key}
            className="nodrag"
            cursor={'default'}
            justifyContent={'right'}
            alignItems={'center'}
            position={'relative'}
            mb={7}
          >
            <MyIcon
              name={'common/settingLight'}
              w={'14px'}
              cursor={'pointer'}
              mr={3}
              _hover={{ color: 'primary.500' }}
              onClick={() =>
                setEditField({
                  inputType: item.type,
                  valueType: item.valueType,
                  key: item.key,
                  label: item.label,
                  description: item.description,
                  required: item.required
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
                  type: 'delInput',
                  key: item.key
                });
                onChangeNode({
                  moduleId,
                  type: 'delOutput',
                  key: item.key
                });
              }}
            />
            {item.description && (
              <MyTooltip label={t(item.description)} forceShow>
                <QuestionOutlineIcon display={['none', 'inline']} mr={1} />
              </MyTooltip>
            )}
            <Box position={'relative'}>
              {t(item.label)}
              {item.required && (
                <Box
                  position={'absolute'}
                  right={'-6px'}
                  top={'-3px'}
                  color={'red.500'}
                  fontWeight={'bold'}
                >
                  *
                </Box>
              )}
            </Box>
            <SourceHandle handleKey={item.key} valueType={item.valueType} />
          </Flex>
        ))}
        <Box textAlign={'right'} mt={5}>
          <Button
            variant={'whitePrimary'}
            leftIcon={<SmallAddIcon />}
            onClick={() => {
              setCreateField(defaultCreateField);
            }}
          >
            {t('core.module.input.Add Input')}
          </Button>
        </Box>
      </Container>
      {!!createField && (
        <FieldEditModal
          editField={createEditField}
          defaultField={createField}
          keys={inputs.map((input) => input.key)}
          onClose={() => setCreateField(undefined)}
          onSubmit={({ data }) => {
            onChangeNode({
              moduleId,
              type: 'addInput',
              value: {
                key: data.key,
                valueType: data.valueType,
                label: data.label,
                type: data.inputType,
                required: data.required,
                description: data.description,
                edit: true,
                editField: createEditField
              }
            });
            onChangeNode({
              moduleId,
              type: 'addOutput',
              value: {
                key: data.key,
                valueType: data.valueType,
                label: data.label,
                type: FlowNodeOutputTypeEnum.source,
                edit: true,
                targets: []
              }
            });
            setCreateField(undefined);
          }}
        />
      )}
      {!!editField?.key && (
        <FieldEditModal
          editField={createEditField}
          defaultField={editField}
          keys={[editField.key]}
          onClose={() => setEditField(undefined)}
          onSubmit={({ data, changeKey }) => {
            if (!data.inputType || !data.key || !data.label) return;

            // check key valid
            const memInput = inputs.find((item) => item.key === editField.key);
            const memOutput = outputs.find((item) => item.key === editField.key);

            if (!memInput || !memOutput) return setEditField(undefined);

            const newInput: FlowNodeInputItemType = {
              ...memInput,
              type: data.inputType,
              valueType: data.valueType,
              key: data.key,
              required: data.required,
              label: data.label,
              description: data.description,
              ...(data.inputType === FlowNodeInputTypeEnum.addInputParam
                ? {
                    editField: {
                      key: true,
                      name: true,
                      description: true,
                      required: true,
                      dataType: true,
                      inputType: false
                    },
                    defaultEditField: {
                      label: '',
                      key: '',
                      description: '',
                      inputType: FlowNodeInputTypeEnum.target,
                      valueType: ModuleIOValueTypeEnum.string,
                      required: true
                    }
                  }
                : {})
            };
            const newOutput: FlowNodeOutputItemType = {
              ...memOutput,
              valueType: data.valueType,
              key: data.key,
              label: data.label
            };

            if (changeKey) {
              onChangeNode({
                moduleId,
                type: 'replaceInput',
                key: editField.key,
                value: newInput
              });
              onChangeNode({
                moduleId,
                type: 'replaceOutput',
                key: editField.key,
                value: newOutput
              });
            } else {
              onChangeNode({
                moduleId,
                type: 'updateInput',
                key: newInput.key,
                value: newInput
              });
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
    </NodeCard>
  );
});
export default function Node({ data }: NodeProps<FlowModuleItemType>) {
  return <NodePluginInput data={data} />;
}
