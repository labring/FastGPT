import React, { useEffect, useRef } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from '../context';

const SandboxTerminal = () => {
  const { sandboxLogs, sandboxState } = useContextSelector(SkillDetailContext, (v) => ({
    sandboxLogs: v.sandboxLogs,
    sandboxState: v.sandboxState
  }));
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sandboxLogs.length]);

  return (
    <Flex h={'100%'} alignItems={'center'} justifyContent={'center'} position={'relative'}>
      {/* Background image */}
      <Box
        position={'absolute'}
        top={'50%'}
        left={'50%'}
        transform={'translate(-50%, -50%)'}
        w={'740px'}
        h={'241px'}
        backgroundImage={'url(/imgs/terminalBg.svg)'}
        backgroundSize={'contain'}
        backgroundRepeat={'no-repeat'}
        backgroundPosition={'center'}
        pointerEvents={'none'}
      />
      <Box
        position={'relative'}
        w={'380px'}
        h={'220px'}
        borderRadius={'8px'}
        bg={'#FFFFFF'}
        boxShadow={'0px 2px 6px 0px rgba(0, 78, 212, 0.06)'}
        overflow={'hidden'}
        display={'flex'}
        flexDirection={'column'}
        _before={{
          content: '""',
          position: 'absolute',
          inset: 0,
          padding: '1px',
          borderRadius: '8px',
          background:
            'conic-gradient(from 180deg at 50% 50%, rgba(50, 170, 255, 0.6) -42deg, rgba(119, 226, 57, 0.6) 19deg, rgba(38, 219, 131, 0.6) 50deg, rgba(81, 155, 252, 0.6) 133deg, rgba(36, 131, 255, 0.6) 151deg, rgba(118, 105, 253, 0.6) 225deg, rgba(237, 125, 214, 0.6) 244deg, rgba(50, 170, 255, 0.6) 318deg, rgba(119, 226, 57, 0.6) 379deg)',
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          pointerEvents: 'none'
        }}
      >
        {/* Header */}
        <Flex
          h={'24px'}
          flexShrink={0}
          bg={'#E6F1FF'}
          alignItems={'center'}
          pl={'12px'}
          gap={'4px'}
        >
          <Box w={'8px'} h={'8px'} borderRadius={'50%'} bg={'#91BBF2'} />
          <Box w={'8px'} h={'8px'} borderRadius={'50%'} bg={'#91BBF2'} />
          <Box w={'8px'} h={'8px'} borderRadius={'50%'} bg={'#50B371'} />
        </Flex>

        {/* Log content */}
        <Box
          flex={1}
          overflow={'auto'}
          px={'12px'}
          py={'8px'}
          fontSize={'xs'}
          lineHeight={'1.8'}
          color={'myGray.600'}
        >
          {sandboxLogs.map((log, i) => (
            <Flex key={i} whiteSpace={'pre-wrap'}>
              <Box color={'myGray.400'} mr={2} flexShrink={0}>
                [{log.timestamp}]
              </Box>
              <Box
                color={
                  log.phase === 'failed'
                    ? 'red.500'
                    : log.phase === 'ready'
                      ? 'green.500'
                      : 'myGray.600'
                }
              >
                {log.message}
              </Box>
            </Flex>
          ))}
          {sandboxState === 'loading' && (
            <Box color={'myGray.400'} mt={'2px'}>
              ...
            </Box>
          )}
          <Box ref={bottomRef} />
        </Box>
      </Box>
    </Flex>
  );
};

export default React.memo(SandboxTerminal);
