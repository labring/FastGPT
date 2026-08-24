import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import type { SourceMemberType } from '@fastgpt/global/support/user/type';
import { useSafeTranslation } from '../../../hooks/useSafeTranslation';
import Avatar from '../Avatar';
import MyPopover from '../MyPopover';
import Tag from '../Tag';

type VersionPublisherPopoverProps = {
  sourceMember: SourceMemberType;
  time: Date | number;
};

/**
 * 渲染版本历史中的发布成员和创建时间。
 * 外层版本列表负责数据请求与操作，这里只复用 App 和 Skill 共用的悬浮卡展示。
 */
const VersionPublisherPopover = ({ sourceMember, time }: VersionPublisherPopoverProps) => {
  const { t } = useSafeTranslation();

  return (
    <MyPopover
      trigger="hover"
      placement={'bottom-end'}
      w={'208px'}
      h={'72px'}
      Trigger={
        <Box display="flex" alignItems="center" cursor="pointer">
          <Avatar src={sourceMember.avatar} borderRadius={'50%'} w={'24px'} h={'24px'} />
        </Box>
      }
    >
      {() => (
        <Flex alignItems={'center'} h={'full'} pl={5} gap={2}>
          <Box>
            <Avatar src={sourceMember.avatar} borderRadius={'50%'} w={'36px'} h={'36px'} />
          </Box>
          <Box>
            <Flex gap={1} fontSize={'sm'} color={'myGray.900'}>
              <Box>{sourceMember.name}</Box>
              {sourceMember.status === 'leave' && <Tag color="gray">{t('common:user_leaved')}</Tag>}
            </Flex>
            <Box fontSize={'xs'} mt={2} color={'myGray.500'}>
              {formatTime2YMDHMS(time)}
            </Box>
          </Box>
        </Flex>
      )}
    </MyPopover>
  );
};

export default React.memo(VersionPublisherPopover);
