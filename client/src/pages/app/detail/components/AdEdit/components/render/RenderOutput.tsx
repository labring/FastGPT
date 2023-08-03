import React, { useCallback, useState } from 'react';
import type { FlowModuleItemType, FlowOutputItemType } from '@/types/flow';
import { Box, Flex } from '@chakra-ui/react';
import { FlowOutputItemTypeEnum } from '@/constants/flow';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { Handle, Position } from 'reactflow';
import MyTooltip from '@/components/MyTooltip';
import SourceHandle from './SourceHandle';
import MyIcon from '@/components/Icon';
import dynamic from 'next/dynamic';
const SetOutputFieldModal = dynamic(() => import('../modules/SetOutputFieldModal'));

const Label = ({
  moduleId,
  outputKey,
  delOutputByKey,
  updateOutput,
  onChangeNode,
  addUpdateOutput,
  ...item
}: FlowOutputItemType & {
  outputKey: string;
  moduleId: string;
  delOutputByKey: (key: string) => void;
  updateOutput: (key: string, val: FlowOutputItemType) => void;
  addUpdateOutput: (val: FlowOutputItemType) => void;
  onChangeNode: FlowModuleItemType['onChangeNode'];
}) => {
  const { label, description, edit } = item;
  const [editField, setEditField] = useState<FlowOutputItemType>();

  return (
    <Flex as={'label'} justifyContent={'right'} alignItems={'center'} position={'relative'}>
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
            onClick={() => delOutputByKey(outputKey)}
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
            console.log(data); // same key
            if (editField.key === data.key) {
              updateOutput(data.key, data);
            } else {
              delOutputByKey(editField.key);
              addUpdateOutput(data);
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
  flowOutputList,
  onChangeNode
}: {
  moduleId: string;
  flowOutputList: FlowOutputItemType[];
  onChangeNode: FlowModuleItemType['onChangeNode'];
}) => {
  const delOutputByKey = useCallback(
    (key: string) => {
      onChangeNode({
        moduleId,
        type: 'outputs',
        key: '',
        value: flowOutputList.filter((output) => output.key !== key)
      });
    },
    [moduleId, flowOutputList, onChangeNode]
  );
  const updateOutput = useCallback(
    (key: string, val: FlowOutputItemType) => {
      onChangeNode({
        moduleId,
        type: 'outputs',
        key: '',
        value: flowOutputList.map((output) => (output.key === key ? val : output))
      });
    },
    [flowOutputList, moduleId, onChangeNode]
  );
  const addUpdateOutput = useCallback(
    (val: FlowOutputItemType) => {
      onChangeNode({
        moduleId,
        type: 'outputs',
        key: '',
        value: flowOutputList.concat(val)
      });
    },
    [flowOutputList, moduleId, onChangeNode]
  );

  return (
    <>
      {flowOutputList.map(
        (item) =>
          item.type !== FlowOutputItemTypeEnum.hidden && (
            <Box key={item.key} _notLast={{ mb: 7 }} position={'relative'}>
              <Label
                moduleId={moduleId}
                onChangeNode={onChangeNode}
                outputKey={item.key}
                delOutputByKey={delOutputByKey}
                addUpdateOutput={addUpdateOutput}
                updateOutput={updateOutput}
                {...item}
              />
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

export default RenderOutput;
