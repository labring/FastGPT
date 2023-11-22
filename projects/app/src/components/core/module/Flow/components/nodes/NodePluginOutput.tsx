import React, { useState } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import { onChangeNode } from '../../FlowProvider';
import dynamic from 'next/dynamic';
import { Box, Button, Flex } from '@chakra-ui/react';
import { QuestionOutlineIcon, SmallAddIcon } from '@chakra-ui/icons';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import Container from '../modules/Container';
import MyIcon from '@/components/Icon';
import MyTooltip from '@/components/MyTooltip';
import { EditFieldType, defaultOutputField } from '../modules/FieldEditModal';
import TargetHandle from '../render/TargetHandle';
import { useToast } from '@/web/common/hooks/useToast';

const FieldEditModal = dynamic(() => import('../modules/FieldEditModal'));

const NodePluginOutput = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { moduleId, inputs, outputs } = data;
  const { toast } = useToast();
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
            mb={7}
          >
            <TargetHandle handleKey={item.key} valueType={item.valueType} />
            <Box position={'relative'}>
              {item.label}
              <Box
                position={'absolute'}
                right={'-6px'}
                top={'-3px'}
                color={'red.500'}
                fontWeight={'bold'}
              >
                *
              </Box>
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
                  type: 'delOutput',
                  key: item.key
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
              setEditField(defaultOutputField);
            }}
          >
            添加出参
          </Button>
        </Box>
      </Container>
      {!!editField && (
        <FieldEditModal
          mode={'output'}
          defaultField={editField}
          onClose={() => setEditField(undefined)}
          onSubmit={(e) => {
            if (e.createSign) {
              // check key repeat
              const memInput = inputs.find((item) => item.key === e.key);
              if (memInput) {
                return toast({
                  status: 'warning',
                  title: '字段key已存在'
                });
              }

              onChangeNode({
                moduleId,
                type: 'addInput',
                value: {
                  key: e.key,
                  valueType: e.valueType,
                  type: e.type,
                  label: e.label,
                  required: e.required,
                  edit: true
                }
              });
              onChangeNode({
                moduleId,
                type: 'addOutput',
                value: {
                  key: e.key,
                  valueType: e.valueType,
                  label: e.label,
                  type: FlowNodeOutputTypeEnum.source,
                  edit: true,
                  targets: []
                }
              });
              return setEditField(undefined);
            }
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
                type: 'updateInput',
                key: editField.key,
                value: input
              });
              onChangeNode({
                moduleId,
                type: 'updateOutput',
                key: editField.key,
                value: output
              });
            } else {
              onChangeNode({
                moduleId,
                type: 'replaceInput',
                key: editField.key,
                value: input
              });
              onChangeNode({
                moduleId,
                type: 'replaceOutput',
                key: editField.key,
                value: output
              });
            }

            setEditField(undefined);
          }}
        />
      )}
    </NodeCard>
  );
};
export default React.memo(NodePluginOutput);
