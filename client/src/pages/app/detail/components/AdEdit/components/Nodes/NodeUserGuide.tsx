import React, { useMemo } from 'react';
import { NodeProps } from 'reactflow';
import { Box, Flex, Textarea } from '@chakra-ui/react';
import { QuestionOutlineIcon } from '@chakra-ui/icons';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@/types/flow';
import Container from '../modules/Container';
import { SystemInputEnum } from '@/constants/app';
import MyIcon from '@/components/Icon';
import MyTooltip from '@/components/MyTooltip';
import { welcomeTextTip } from '@/constants/flow/ModuleTemplate';

const NodeUserGuide = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { inputs, moduleId, onChangeNode } = data;
  const welcomeText = useMemo(
    () => inputs.find((item) => item.key === SystemInputEnum.welcomeText),
    [inputs]
  );

  return (
    <>
      <NodeCard minW={'300px'} {...data}>
        <Container borderTop={'2px solid'} borderTopColor={'myGray.200'}>
          <>
            <Flex mb={1} alignItems={'center'}>
              <MyIcon name={'welcomeText'} mr={2} w={'16px'} color={'#E74694'} />
              <Box>开场白</Box>
              <MyTooltip label={welcomeTextTip} forceShow>
                <QuestionOutlineIcon display={['none', 'inline']} ml={1} />
              </MyTooltip>
            </Flex>
            {welcomeText && (
              <Textarea
                className="nodrag"
                rows={6}
                resize={'both'}
                defaultValue={welcomeText.value}
                bg={'myWhite.500'}
                placeholder={welcomeTextTip}
                onChange={(e) => {
                  onChangeNode({
                    moduleId,
                    key: SystemInputEnum.welcomeText,
                    type: 'inputs',
                    value: {
                      ...welcomeText,
                      value: e.target.value
                    }
                  });
                }}
              />
            )}
          </>
        </Container>
      </NodeCard>
    </>
  );
};
export default React.memo(NodeUserGuide);
