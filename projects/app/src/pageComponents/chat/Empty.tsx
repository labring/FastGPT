import React from 'react';
import { Card, Box, Flex } from '@chakra-ui/react';
import { useMarkdown } from '@/web/common/hooks/useMarkdown';

import dynamic from 'next/dynamic';
const Markdown = dynamic(() => import('@/components/Markdown'));
const Avatar = dynamic(() => import('@fastgpt/web/components/common/Avatar'));

const Empty = ({
  showChatProblem,
  model: { name, intro, avatar }
}: {
  showChatProblem: boolean;
  model: {
    name: string;
    intro: string;
    avatar: string;
  };
}) => {};

export default Empty;
