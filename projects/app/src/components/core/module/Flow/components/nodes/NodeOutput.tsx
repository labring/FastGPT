import React, { useState } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import { onChangeNode } from '../../FlowProvider';

import dynamic from 'next/dynamic';
import { Box, Button, Flex } from '@chakra-ui/react';
import { QuestionOutlineIcon, SmallAddIcon } from '@chakra-ui/icons';
import { customAlphabet } from 'nanoid';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeValTypeEnum
} from '@fastgpt/global/core/module/node/constant';
import Container from '../modules/Container';
import MyIcon from '@/components/Icon';
import MyTooltip from '@/components/MyTooltip';
import { EditFieldType } from '../modules/FieldEditModal';
import TargetHandle from '../render/TargetHandle';

const FieldEditModal = dynamic(() => import('../modules/FieldEditModal'));
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);

const NodeOutput = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { moduleId, inputs, outputs } = data;
  const [editField, setEditField] = useState<EditFieldType>();

  return (
    <NodeCard minW={'300px'} {...data}>
      <Container mt={1} borderTop={'2px solid'} borderTopColor={'myGray.300'}>
        {inputs.map((item) => (
          <Flex
            key={item.key}
            className="nodrag"
            cursor={'default'}
            justifyContent={'left'}
            alignItems={'center'}
            position={'relative'}
            mb={4}
          >
            <TargetHandle handleKey={item.key} valueType={item.valueType} />
            <Box position={'relative'}>
              {item.label}
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

            <MyIcon
              name={'settingLight'}
              w={'14px'}
              cursor={'pointer'}
              ml={3}
              _hover={{ color: 'myBlue.600' }}
              onClick={() =>
                setEditField({
                  key: item.key,
                  label: item.label,
                  valueType: item.valueType,
                  description: item.description
                })
              }
            />
            <MyIcon
              className="delete"
              name={'delete'}
              w={'14px'}
              cursor={'pointer'}
              ml={3}
              _hover={{ color: 'red.500' }}
              onClick={() => {
                onChangeNode({
                  moduleId,
                  type: 'delInput',
                  key: item.key,
                  value: ''
                });
                onChangeNode({
                  moduleId,
                  type: 'outputs',
                  key: '',
                  value: outputs.filter((item) => item.key !== item.key)
                });
              }}
            />

            {item.description && (
              <MyTooltip label={item.description} forceShow>
                <QuestionOutlineIcon display={['none', 'inline']} mr={1} />
              </MyTooltip>
            )}
          </Flex>
        ))}
        <Box textAlign={'left'} mt={5}>
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
                  valueType: FlowNodeValTypeEnum.string,
                  type: FlowNodeInputTypeEnum.target,
                  label: `入参${inputs.length + 1}`,
                  edit: true,
                  required: true
                }
              });
              onChangeNode({
                moduleId,
                type: 'outputs',
                key,
                value: [
                  {
                    key,
                    label: `入参${inputs.length + 1}`,
                    valueType: FlowNodeValTypeEnum.string,
                    type: FlowNodeOutputTypeEnum.source,
                    edit: true,
                    targets: []
                  }
                ].concat(outputs as any)
              });
            }}
          >
            添加入参
          </Button>
        </Box>
      </Container>
      {!!editField && (
        <FieldEditModal
          mode={'output'}
          defaultField={editField}
          onClose={() => setEditField(undefined)}
          onSubmit={(e) => {
            const memInput = inputs.find((item) => item.key === editField.key);
            const memOutput = outputs.find((item) => item.key === editField.key);
            if (!memInput || !memOutput) return;
            const input = {
              ...memInput,
              ...e
            };
            const output = {
              ...memOutput,
              ...e
            };
            // not update key
            if (editField.key === e.key) {
              onChangeNode({
                moduleId,
                type: 'inputs',
                key: e.key,
                value: input
              });
              onChangeNode({
                moduleId,
                type: 'outputs',
                key: '',
                value: outputs.map((item) => (item.key === output.key ? output : item))
              });
            } else {
              // diff key. Add new input and delete old input; Delete old output and add new output
              onChangeNode({
                moduleId,
                type: 'addInput',
                key: input.key,
                value: input
              });

              let index = 0;
              const storeOutputs = outputs.filter((item, i) => {
                if (item.key !== editField.key) {
                  return true;
                }
                index = i;
                return false;
              });
              onChangeNode({
                moduleId,
                type: 'outputs',
                key: '',
                value: storeOutputs
              });

              setTimeout(() => {
                onChangeNode({
                  moduleId,
                  type: 'delInput',
                  key: editField.key,
                  value: ''
                });
                storeOutputs.splice(index, 0, output);
                onChangeNode({
                  moduleId,
                  type: 'outputs',
                  key: '',
                  value: [...storeOutputs]
                });
              });
            }

            setEditField(undefined);
          }}
        />
      )}
    </NodeCard>
  );
};
export default React.memo(NodeOutput);
