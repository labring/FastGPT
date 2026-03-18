import React, { useEffect, useState } from 'react';
import { Box } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';

const B = 6; // block size px
const G = 2; // gap px
const U = B + G; // 8px unit

const BLUE = '#197DFF';
const GREEN = '#66CC88';

type Block = { row: number; col: number; color: 'blue' | 'green' };

// 4 letter-shaped frames: F → A → 4 → T
const FRAMES: Block[][] = [
  // Frame 1: "F"
  [
    { row: 0, col: 0, color: 'blue' },
    { row: 0, col: 1, color: 'blue' },
    { row: 0, col: 2, color: 'blue' },
    { row: 1, col: 0, color: 'green' },
    { row: 1, col: 1, color: 'green' },
    { row: 1, col: 2, color: 'green' },
    { row: 2, col: 0, color: 'blue' }
  ],
  // Frame 2: "A"
  [
    { row: 0, col: 1, color: 'green' },
    { row: 1, col: 0, color: 'blue' },
    { row: 1, col: 1, color: 'green' },
    { row: 1, col: 2, color: 'blue' },
    { row: 2, col: 0, color: 'blue' },
    { row: 2, col: 2, color: 'green' }
  ],
  // Frame 3: "4"
  [
    { row: 0, col: 0, color: 'blue' },
    { row: 0, col: 1, color: 'green' },
    { row: 1, col: 0, color: 'blue' },
    { row: 1, col: 1, color: 'blue' },
    { row: 1, col: 2, color: 'green' },
    { row: 2, col: 1, color: 'green' },
    { row: 2, col: 2, color: 'blue' }
  ],
  // Frame 4: "T"
  [
    { row: 0, col: 0, color: 'blue' },
    { row: 0, col: 1, color: 'blue' },
    { row: 0, col: 2, color: 'green' },
    { row: 1, col: 1, color: 'green' },
    { row: 2, col: 1, color: 'blue' }
  ]
];

const snapIn = keyframes`
  0%   { opacity: 0; transform: scale(0.2); }
  65%  { opacity: 1; transform: scale(1.2); }
  100% { opacity: 1; transform: scale(1); }
`;

const snapOut = keyframes`
  0%   { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.2); }
`;

const HOLD_MS = 900; // each frame stays for this duration
const EXIT_MS = 180; // exit animation duration
const ENTER_MS = 180; // enter animation duration
const STAGGER_MS = 50; // delay between each block appearing

const BuildingAnimation = () => {
  const [frameIdx, setFrameIdx] = useState(0);
  const [phase, setPhase] = useState<'enter' | 'exit'>('enter');

  useEffect(() => {
    const tick = () => {
      setPhase('exit');
      setTimeout(() => {
        setFrameIdx((prev) => (prev + 1) % FRAMES.length);
        setPhase('enter');
      }, EXIT_MS + 30);
    };
    const id = setInterval(tick, HOLD_MS + EXIT_MS);
    return () => clearInterval(id);
  }, []);

  // Sort top-to-bottom, left-to-right so blocks "build" from top
  const blocks = [...FRAMES[frameIdx]].sort((a, b) =>
    a.row !== b.row ? a.row - b.row : a.col - b.col
  );

  return (
    <Box w="22px" h="22px" position="relative" flexShrink={0}>
      {blocks.map((block, i) => (
        <Box
          key={
            phase === 'enter'
              ? `e${frameIdx}-${block.row}-${block.col}`
              : `x-${block.row}-${block.col}`
          }
          position="absolute"
          top={`${block.row * U}px`}
          left={`${block.col * U}px`}
          w={`${B}px`}
          h={`${B}px`}
          bg={block.color === 'blue' ? BLUE : GREEN}
          borderRadius="1px"
          sx={
            phase === 'enter'
              ? {
                  animation: `${snapIn} ${ENTER_MS}ms ease-out both`,
                  animationDelay: `${i * STAGGER_MS}ms`
                }
              : {
                  animation: `${snapOut} ${EXIT_MS}ms ease-in both`
                }
          }
        />
      ))}
    </Box>
  );
};

export default BuildingAnimation;
