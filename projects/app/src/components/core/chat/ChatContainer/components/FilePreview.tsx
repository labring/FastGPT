import React from 'react';
import { type FieldArrayWithId } from 'react-hook-form';
import { type ChatBoxInputFormType } from '../ChatBox/type';
import { Box, CircularProgress, Flex, HStack } from '@chakra-ui/react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyImage from '@fastgpt/web/components/common/Image/MyImage';
import { getFileIcon } from '@fastgpt/global/common/file/icon';

const RenderFilePreview = ({
  fileList,
  removeFiles
}: {
  fileList: FieldArrayWithId<ChatBoxInputFormType, 'files', 'id'>[];
  removeFiles?: (index?: number | number[]) => void;
}) => {
  const { isPc } = useSystem();

  return fileList.length > 0 ? (
    <Flex
      overflow={'visible'}
      wrap={'wrap'}
      pt={[2, 3]}
      userSelect={'none'}
      mb={fileList.length > 0 ? 2 : 0}
      gap={'6px'}
    >
      {fileList.map((item, index) => {
        const isFile = item.type === ChatFileTypeEnum.file;
        const isImage = item.type === ChatFileTypeEnum.image;
        const icon = getFileIcon(item.name);

        return (
          <MyBox
            key={index}
            maxW={isFile ? 56 : 14}
            w={isFile ? 'calc(50% - 3px)' : '12.5%'}
            aspectRatio={isFile ? 4 : 1}
          >
            <Box
              border={'sm'}
              boxShadow={
                '0px 2.571px 6.429px 0px rgba(19, 51, 107, 0.08), 0px 0px 0.643px 0px rgba(19, 51, 107, 0.08)'
              }
              rounded={'md'}
              position={'relative'}
              _hover={{
                '.close-icon': { display: 'block' }
              }}
              w={'full'}
              h={'full'}
              alignItems={'center'}
              pl={isFile ? 1 : 0}
            >
              {removeFiles && (
                <MyIcon
                  name={'closeSolid'}
                  w={'16px'}
                  h={'16px'}
                  color={'myGray.700'}
                  cursor={'pointer'}
                  _hover={{ color: 'red.500' }}
                  position={'absolute'}
                  rounded={'full'}
                  bg={'white'}
                  right={'-8px'}
                  top={'-8px'}
                  onClick={() => removeFiles(index)}
                  className="close-icon"
                  display={['', 'none']}
                  zIndex={10}
                />
              )}
              {isImage && (
                <MyImage
                  alt={'img'}
                  src={item.icon || item.url}
                  w={'full'}
                  h={'full'}
                  borderRadius={'md'}
                  objectFit={'contain'}
                />
              )}
              {isFile && (
                <HStack alignItems={'center'} h={'full'}>
                  <MyIcon name={icon as any} w={['1.5rem', '2rem']} h={['1.5rem', '2rem']} />
                  <Box flex={'1 0 0'} pr={2} className="textEllipsis" fontSize={'xs'}>
                    {item.name}
                  </Box>
                </HStack>
              )}
              {/* Process */}
              {!item.url && (
                <Flex
                  position={'absolute'}
                  inset="0"
                  bg="rgba(255,255,255,0.4)"
                  alignItems="center"
                  justifyContent="center"
                >
                  <CircularProgress
                    value={item.process}
                    color="primary.600"
                    bg={'white'}
                    size={isPc ? '30px' : '35px'}
                  >
                    {/* <CircularProgressLabel>{item.process ?? 0}%</CircularProgressLabel> */}
                  </CircularProgress>
                </Flex>
              )}
            </Box>
          </MyBox>
        );
      })}
    </Flex>
  ) : null;
};

export default React.memo(RenderFilePreview);
