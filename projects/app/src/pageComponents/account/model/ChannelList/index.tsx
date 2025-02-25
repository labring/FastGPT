import { useUserStore } from '@/web/support/user/useUserStore';
import { useTranslation } from 'react-i18next';

import { Box, Flex, useDisclosure, Button } from '@chakra-ui/react';
import ChannelTable from './channelTable';
import { useState } from 'react';

const ChannelList = ({ Tab }: { Tab: React.ReactNode }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [operationType, setOperationType] = useState<'create' | 'update'>('create');
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const isRoot = userInfo?.username === 'root';
  return (
    <>
      {isRoot && (
        <Flex justifyContent={'space-between'}>
          {Tab}
          <Button
            display="flex"
            padding="8px 14px"
            justifyContent="center"
            alignItems="center"
            gap="6px"
            borderRadius="6px"
            color="white"
            fontSize="12px"
            fontFamily="PingFang SC"
            fontWeight="500"
            whiteSpace="nowrap"
            lineHeight="16px"
            letterSpacing="0.5px"
            transition="all 0.2s ease"
            _hover={{
              transform: 'scale(1.05)',
              transition: 'transform 0.2s ease'
            }}
            _active={{
              transform: 'scale(0.92)',
              animation: 'pulse 0.3s ease'
            }}
            sx={{
              '@keyframes pulse': {
                '0%': { transform: 'scale(0.92)' },
                '50%': { transform: 'scale(0.96)' },
                '100%': { transform: 'scale(0.92)' }
              }
            }}
            onClick={() => {
              setOperationType('create');
              onOpen();
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M7.99996 2.66675C8.36815 2.66675 8.66663 2.96522 8.66663 3.33341V7.33341H12.6666C13.0348 7.33341 13.3333 7.63189 13.3333 8.00008C13.3333 8.36827 13.0348 8.66675 12.6666 8.66675H8.66663V12.6667C8.66663 13.0349 8.36815 13.3334 7.99996 13.3334C7.63177 13.3334 7.33329 13.0349 7.33329 12.6667V8.66675H3.33329C2.9651 8.66675 2.66663 8.36827 2.66663 8.00008C2.66663 7.63189 2.9651 7.33341 3.33329 7.33341H7.33329V3.33341C7.33329 2.96522 7.63177 2.66675 7.99996 2.66675Z"
                fill="white"
              />
            </svg>
            {t('common:channel.create')}
          </Button>
        </Flex>
      )}
      <Box flex={'1 0 0'}>
        <ChannelTable
          isOpen={isOpen}
          onOpen={onOpen}
          onClose={onClose}
          operationType={operationType}
          setOperationType={setOperationType}
        />
      </Box>
    </>
  );
};

export default ChannelList;
