import { Box, Button, Image } from '@chakra-ui/react';

export default function ComfirmVar({
  newVariables,
  onCancel,
  onConfirm
}: {
  newVariables: string[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <Box
        background={'rgba(35, 56, 118, 0.2)'}
        rounded={'sm'}
        position={'absolute'}
        top={0}
        left={0}
        right={0}
        bottom={0}
      />
      <Box
        position={'absolute'}
        top={'50%'}
        left={'50%'}
        transform={'translate(-50%, -50%)'}
        w={'70%'}
        h={'70%'}
        bg={'white'}
        rounded={'lg'}
        boxShadow={'0 2px 4px rgba(0, 0, 0, 0.1)'}
        display={'flex'}
        flexDirection={'column'}
        justifyContent={'space-between'}
        pb={4}
      >
        <Box display={'flex'} mt={4} mr={4}>
          <Box
            w={'36px'}
            h={'36px'}
            minW={'36px'}
            boxShadow={'0 4px 8px rgba(0, 0, 0, 0.1)'}
            display={'flex'}
            alignItems={'center'}
            justifyContent={'center'}
            rounded={'md'}
            border={'1px solid rgba(0, 0, 0, 0.1)'}
            mx={4}
          >
            <Image alt={''} src={'/imgs/workflow/variable.png'} objectFit={'contain'} w={'20px'} />
          </Box>
          <Box>引用了未定义的变量，是否自动添加？</Box>
        </Box>
        <Box
          ml={16}
          mt={4}
          fontSize={'sm'}
          color={'rgb(28,100,242)'}
          display={'flex'}
          whiteSpace={'wrap'}
        >
          {newVariables.map((item, index) => (
            <Box
              key={index}
              display={'flex'}
              alignItems={'center'}
              justifyContent={'center'}
              bg={'rgb(237,242,250)'}
              px={1}
              h={6}
              rounded={'md'}
              mr={2}
            >
              <span>
                <span style={{ opacity: '60%' }}>{`{{`}</span>
                <span>{item}</span>
                <span style={{ opacity: '60%' }}>{`}}`}</span>
              </span>
            </Box>
          ))}
        </Box>
        <Box>
          <Box display={'flex'} justifyContent={'flex-end'} mt={4} mr={4}>
            <Button size={'sm'} variant={'ghost'} onClick={onCancel}>
              取消
            </Button>
            <Button size={'sm'} variant={'primary'} ml={4} onClick={onConfirm}>
              确定
            </Button>
          </Box>
        </Box>
      </Box>
    </>
  );
}
