import React, { useState } from 'react';
import type { FlowOutputItemType } from '@/types/core/app/flow';
import { Box, Flex } from '@chakra-ui/react';
import { FlowOutputItemTypeEnum } from '@/constants/flow';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MyTooltip from '@/components/MyTooltip';
import SourceHandle from './SourceHandle';
import MyIcon from '@/components/Icon';
import dynamic from 'next/dynamic';
const SetOutputFieldModal = dynamic(() => import('../modules/SetOutputFieldModal'));
import { useFlowStore } from '../Provider';

const Label = ({
  moduleId,
  outputKey,
  outputs,
  ...item
}: FlowOutputItemType & {
  outputKey: string;
  moduleId: string;
  outputs: FlowOutputItemType[];
}) => {
  const { label, description, edit } = item;
  const [editField, setEditField] = useState<FlowOutputItemType>();
  const { onChangeNode } = useFlowStore();

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
                ...item,
                key: outputKey
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
                type: 'outputs',
                key: '',
                value: outputs.filter((output) => output.key !== outputKey)
              });
            }}
          />
        </>
      )}
      {description && (
        <MyTooltip label={description} forceShow>
          <QuestionOutlineIcon display={['none', 'inline']} mr={1} />
        </MyTooltip>
      )}
      <Box>{label}</Box>

      {!!editField && (
        <SetOutputFieldModal
          defaultField={editField}
          onClose={() => setEditField(undefined)}
          onSubmit={(data) => {
            if (editField.key === data.key) {
              onChangeNode({
                moduleId,
                type: 'outputs',
                key: '',
                value: outputs.map((output) => (output.key === outputKey ? data : output))
              });
            } else {
              let index = 0;
              const storeOutputs = outputs.filter((output, i) => {
                if (output.key !== editField.key) {
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
                storeOutputs.splice(index, 0, data);
                console.log(index, storeOutputs);
                onChangeNode({
                  moduleId,
                  type: 'outputs',
                  key: '',
                  value: [...storeOutputs]
                });
              }, 10);
            }

            setEditField(undefined);
          }}
        />
      )}
    </Flex>
  );
};

const RenderOutput = ({
  moduleId,
  flowOutputList
}: {
  moduleId: string;
  flowOutputList: FlowOutputItemType[];
}) => {
  return (
    <>
      {flowOutputList.map(
        (item) =>
          item.type !== FlowOutputItemTypeEnum.hidden && (
            <Box key={item.key} _notLast={{ mb: 7 }} position={'relative'}>
              <Label moduleId={moduleId} outputKey={item.key} outputs={flowOutputList} {...item} />
              <Box mt={FlowOutputItemTypeEnum.answer ? 0 : 2} className={'nodrag'}>
                {item.type === FlowOutputItemTypeEnum.source && (
                  <SourceHandle handleKey={item.key} valueType={item.valueType} />
                )}
              </Box>
            </Box>
          )
      )}
    </>
  );
};

export default React.memo(RenderOutput);
