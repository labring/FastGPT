'use client';
import BoxCard from '@/components/admin/BoxContainer/Card';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Flex,
  Box,
  HStack,
  InputGroup,
  Input,
  InputLeftElement,
  Button,
  FormLabel,
  Checkbox
} from '@chakra-ui/react';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import type { SystemLogType } from '@fastgpt/service/common/system/log/type';
import { getSystemLogList } from '@/web/admin/common/api';
import { LogLevelEnum } from '@fastgpt/service/common/system/log/constant';
import { accountTitleTextStyles } from '@/pageComponents/account/styles';

const LogTable = () => {
  const { isPc } = useSystem();
  const [search, setSearch] = useState<string>();
  const [logLevel, setLogLevel] = useState<LogLevelEnum[]>([LogLevelEnum.error]);
  const [logDetail, setLogDetail] = useState<SystemLogType>();

  const {
    data: logs,
    isLoading,
    ScrollData
  } = usePagination(getSystemLogList, {
    defaultPageSize: 20,
    pageSizeCacheKey: 'log-system',
    params: {
      search,
      logLevel
    },
    type: 'scroll',
    refreshDeps: [logLevel, search]
  });

  return (
    <BoxCard display={'flex'} flexDirection={'column'} h={'100%'}>
      <HStack pb={4}>
        {isPc && (
          <Box as={'h1'} {...accountTitleTextStyles}>
            日志记录表
          </Box>
        )}
        <Box flexGrow={1}></Box>
        <InputGroup w={'350px'}>
          <InputLeftElement h={'full'}>
            <MyIcon name="common/searchLight" w={4} color={'myGray.400'} />
          </InputLeftElement>
          <Input
            placeholder="请想要查找的日志内容，回车搜索"
            size={'sm'}
            onChange={(e) => setSearch(e.target.value)}
          ></Input>
        </InputGroup>
      </HStack>

      <ScrollData position={'relative'} h={'100%'} overflow={'overlay'}>
        <TableContainer>
          <Table>
            <Thead>
              <Tr>
                <Th>时间</Th>
                <Th>
                  <LevelPopover logLevels={logLevel} setLogLevels={setLogLevel} />{' '}
                </Th>
                <Th>日志内容</Th>
                <Th>metadata</Th>
                <Th></Th>
              </Tr>
            </Thead>
            <Tbody fontSize={'sm'}>
              {logs.map((item, i) => (
                <Tr key={i}>
                  <Td>{item.time ? dayjs(item.time).format('YYYY/MM/DD HH:mm:ss') : '-'}</Td>
                  <Td maxW={'180px'}>{LogLevelEnum[item.level]}</Td>
                  <Td maxW={'300px'} className="textEllipsis">
                    {item.text}
                  </Td>
                  <Td maxW={'300px'} className="textEllipsis">
                    {JSON.stringify(item.metadata)}
                  </Td>
                  <Td>
                    <Button variant={'whiteBase'} onClick={() => setLogDetail(item)}>
                      详情
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {!isLoading && logs.length === 0 && (
            <Flex
              mt={'20vh'}
              flexDirection={'column'}
              alignItems={'center'}
              justifyContent={'center'}
            >
              <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
              <Box mt={2} color={'myGray.500'}>
                暂无Log记录～
              </Box>
            </Flex>
          )}
        </TableContainer>
      </ScrollData>
      {logDetail && <LogDetailModal log={logDetail} onClose={() => setLogDetail(undefined)} />}
    </BoxCard>
  );
};

function LevelPopover({
  logLevels,
  setLogLevels
}: {
  logLevels: LogLevelEnum[];
  setLogLevels: any;
}) {
  const options = useMemo(() => [0, 1, 2, 3], []);
  const handleClick = (level: LogLevelEnum, e: any) => {
    if (e.target && e.target.name === 'logLevel') return;
    setLogLevels(
      logLevels.includes(level) ? logLevels.filter((item) => item !== level) : [...logLevels, level]
    );
  };
  return (
    <MyPopover
      placement="bottom"
      hasArrow={false}
      offset={[2, 2]}
      w={'180px'}
      closeOnBlur={true}
      trigger={'click'}
      Trigger={
        <Flex
          alignItems={'center'}
          px={3}
          py={2}
          w={['140px', '180px']}
          borderRadius={'md'}
          border={'1px solid'}
          borderColor={'myGray.250'}
          cursor={'pointer'}
          overflow={'hidden'}
          h={['28px', '36px']}
          fontSize={'sm'}
        >
          <Flex flex={'1 0 0'}>
            {'日志等级'}
            <Box as={'span'}>
              {logLevels.length > 0 && (
                <Box ml={1} fontSize={'xs'} color={'myGray.600'}>
                  {`(${logLevels.length})`}
                </Box>
              )}
            </Box>
          </Flex>
          <MyIcon name={'core/chat/chevronDown'} w={'14px'} />
        </Flex>
      }
    >
      {() => {
        return (
          <>
            {options.map((l: LogLevelEnum) => {
              const checked = logLevels.includes(l);
              return (
                <Flex
                  alignItems={'center'}
                  fontSize={'sm'}
                  px={1}
                  py={1}
                  my={1}
                  cursor={'pointer'}
                  color={checked ? 'primary.700' : 'myGray.600'}
                  _hover={{
                    bg: '#1118240D',
                    color: 'primary.700',
                    ...(checked ? {} : { svg: { color: '#F3F3F4' } })
                  }}
                  borderRadius={'xs'}
                  key={l}
                  onClick={(e) => handleClick(l, e)}
                >
                  <Checkbox isChecked={checked} name="logLevel" size={'md'} />
                  <Box ml={2}>{LogLevelEnum[l]}</Box>
                </Flex>
              );
            })}
          </>
        );
      }}
    </MyPopover>
  );
}

function LogDetailModal({ log, onClose }: { log: SystemLogType; onClose: () => void }) {
  return (
    <MyModal title={'日志详情'} maxW={'90vw'} w={'100%'} isOpen={true} onClose={onClose}>
      <Flex flexDir={'column'} gap={'1rem'}>
        <Flex alignItems={'center'} justify={'space-between'}>
          <FormLabel flex={'0 0 120px'}>{'时间:'}</FormLabel>
          <Box>{log.time ? dayjs(log.time).format('YYYY/MM/DD HH:mm:ss') : '-'}</Box>
        </Flex>
        <Flex alignItems={'center'} justify={'space-between'}>
          <FormLabel flex={'0 0 120px'}>{'日志等级:'}</FormLabel>
          <Box>{LogLevelEnum[log.level]}</Box>
        </Flex>
        <Box>
          <FormLabel flex={'0 0 120px'}>{'日志消息:'}</FormLabel>
          <Box
            borderRadius={'lg'}
            border={'1px solid'}
            borderColor={'myGray.200'}
            bg={'myGray.100'}
            p={2}
            maxH={'300px'}
            overflowY={'auto'}
          >
            {log.text}
          </Box>
        </Box>

        {log.metadata && (
          <Box>
            <FormLabel flex={'0 0 120px'}>{'METADATA:'}</FormLabel>
            <Box
              borderRadius={'lg'}
              border={'1px solid'}
              borderColor={'myGray.200'}
              bg={'myGray.100'}
              p={2}
              maxH={'300px'}
              overflowY={'auto'}
              whiteSpace={'pre'}
            >
              {JSON.stringify(log.metadata, null, 2)}
            </Box>
          </Box>
        )}
      </Flex>
    </MyModal>
  );
}

export default LogTable;
