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
import SourceHandle from '../render/SourceHandle';
import { defaultInputField, type EditFieldType } from '../modules/FieldEditModal';
import { useToast } from '@/web/common/hooks/useToast';

const FieldEditModal = dynamic(() => import('../modules/FieldEditModal'));

const NodePluginInput = ({ data }: NodeProps<FlowModuleItemType>) => {
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
            justifyContent={'right'}
            alignItems={'center'}
            position={'relative'}
            mb={7}
          >
            <MyIcon
              name={'settingLight'}
              w={'14px'}
              cursor={'pointer'}
              mr={3}
              _hover={{ color: 'myBlue.600' }}
              onClick={() =>
                setEditField({
                  type: item.type,
                  key: item.key,
                  label: item.label,
                  valueType: item.valueType,
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
              <MyTooltip label={item.description} forceShow>
                <QuestionOutlineIcon display={['none', 'inline']} mr={1} />
              </MyTooltip>
            )}
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
            <SourceHandle handleKey={item.key} valueType={item.valueType} />
          </Flex>
        ))}
        <Box textAlign={'right'} mt={5}>
          <Button
            variant={'base'}
            leftIcon={<SmallAddIcon />}
            onClick={() => {
              setEditField(defaultInputField);
            }}
          >
            添加入参
          </Button>
        </Box>
      </Container>
      {!!editField && (
        <FieldEditModal
          mode={'pluginInput'}
          defaultField={editField}
          onClose={() => setEditField(undefined)}
          onSubmit={(e) => {
            // create field
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
            // check key valid
            const memInput = inputs.find((item) => item.key === editField.key);
            const memOutput = outputs.find((item) => item.key === editField.key);

            if (!memInput || !memOutput) return setEditField(undefined);
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
export default React.memo(NodePluginInput);
