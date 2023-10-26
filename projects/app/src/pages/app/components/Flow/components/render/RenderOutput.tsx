import React, { useMemo, useState } from 'react';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/module/node/type';
import { Box, Flex } from '@chakra-ui/react';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import MyTooltip from '@/components/MyTooltip';
import SourceHandle from './SourceHandle';
import MyIcon from '@/components/Icon';
import dynamic from 'next/dynamic';
import { onChangeNode } from '../../FlowProvider';
import { SystemOutputEnum } from '@/constants/app';

import type { EditFieldType } from '../modules/FieldEditModal';
const FieldEditModal = dynamic(() => import('../modules/FieldEditModal'));

const Label = ({
  moduleId,
  outputKey,
  outputs,
  ...item
}: FlowNodeOutputItemType & {
  outputKey: string;
  moduleId: string;
  outputs: FlowNodeOutputItemType[];
}) => {
  const { label, description, edit } = item;
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
        <FieldEditModal
          type={'output'}
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
  flowOutputList: FlowNodeOutputItemType[];
}) => {
  const sortOutput = useMemo(
    () =>
      [...flowOutputList].sort((a, b) => {
        if (a.key === SystemOutputEnum.finish) return -1;
        if (b.key === SystemOutputEnum.finish) return 1;
        return 0;
      }),
    [flowOutputList]
  );

  return (
    <>
      {sortOutput.map(
        (item) =>
          item.type !== FlowNodeOutputTypeEnum.hidden && (
            <Box key={item.key} _notLast={{ mb: 7 }} position={'relative'}>
              <Label moduleId={moduleId} outputKey={item.key} outputs={sortOutput} {...item} />
              <Box mt={FlowNodeOutputTypeEnum.answer ? 0 : 2} className={'nodrag'}>
                {item.type === FlowNodeOutputTypeEnum.source && (
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
