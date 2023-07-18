import React, { useMemo } from 'react';
import { NodeProps } from 'reactflow';
import { Box, Flex, Textarea } from '@chakra-ui/react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@/types/flow';
import Container from '../modules/Container';
import { SystemInputEnum } from '@/constants/app';
import MyIcon from '@/components/Icon';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 6);
import MyTooltip from '@/components/MyTooltip';

const welcomePlaceholder =
  '每次对话开始前，发送一个初始内容。可使用的特殊标记:\n[快捷按键]: 用户点击后可以直接发送该问题';

const NodeUserGuide = ({
  data: { inputs, outputs, onChangeNode, ...props }
}: NodeProps<FlowModuleItemType>) => {
  const welcomeText = useMemo(
    () => inputs.find((item) => item.key === SystemInputEnum.welcomeText)?.value,
    [inputs]
  );

  return (
    <>
      <NodeCard minW={'300px'} {...props}>
        <Container borderTop={'2px solid'} borderTopColor={'myGray.200'}>
          <>
            <Flex mb={1} alignItems={'center'}>
              <MyIcon name={'welcomeText'} mr={2} w={'16px'} color={'#E74694'} />
              <Box>开场白</Box>
              <MyTooltip label={welcomePlaceholder}>
                <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
              </MyTooltip>
            </Flex>
            <Textarea
              className="nodrag"
              rows={6}
              resize={'both'}
              defaultValue={welcomeText}
              bg={'myWhite.500'}
              placeholder={welcomePlaceholder}
              onChange={(e) => {
                onChangeNode({
                  moduleId: props.moduleId,
                  key: SystemInputEnum.welcomeText,
                  type: 'inputs',
                  value: e.target.value
                });
              }}
            />
          </>
        </Container>
      </NodeCard>
    </>
  );
};
export default React.memo(NodeUserGuide);
