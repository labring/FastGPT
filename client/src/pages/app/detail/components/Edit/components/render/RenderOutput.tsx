import React from 'react';
import type { FlowOutputItemType } from '@/types/flow';
import { Box, Flex } from '@chakra-ui/react';
import { FlowOutputItemTypeEnum } from '@/constants/flow';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import { Handle, Position } from 'reactflow';
import MyTooltip from '@/components/MyTooltip';

const Label = ({
  children,
  description
}: {
  children: React.ReactNode | string;
  description?: string;
}) => (
  <Flex as={'label'} justifyContent={'right'} alignItems={'center'} position={'relative'}>
    {description && (
      <MyTooltip label={description} forceShow>
        <QuestionOutlineIcon display={['none', 'inline']} mr={1} />
      </MyTooltip>
    )}
    {children}
  </Flex>
);

const RenderBody = ({ flowOutputList }: { flowOutputList: FlowOutputItemType[] }) => {
  return (
    <>
      {flowOutputList.map(
        (item) =>
          item.type !== FlowOutputItemTypeEnum.hidden && (
            <Box key={item.key} _notLast={{ mb: 7 }} position={'relative'}>
              <Label description={item.description}>{item.label}</Label>
              <Box mt={FlowOutputItemTypeEnum.answer ? 0 : 2} className={'nodrag'}>
                {item.type === FlowOutputItemTypeEnum.source && (
                  <Handle
                    style={{
                      top: '50%',
                      right: '-14px',
                      transform: 'translate(50%,-50%)',
                      width: '12px',
                      height: '12px',
                      background: '#9CA2A8'
                    }}
                    type="source"
                    id={item.key}
                    position={Position.Right}
                  />
                )}
              </Box>
            </Box>
          )
      )}
    </>
  );
};

export default React.memo(RenderBody);
