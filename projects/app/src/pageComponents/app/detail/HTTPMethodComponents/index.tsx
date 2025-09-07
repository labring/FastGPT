import { Box } from '@chakra-ui/react';

export const POST = () => {
  return (
    <Box
      display={'inline-flex'}
      padding={'2px 4px'}
      justifyContent={'center'}
      alignItems={'center'}
      gap={'10px'}
      borderRadius={'4px'}
      background={'#FFFAEB'}
      color={'#DC6803'}
      fontFamily={'PingFang SC'}
      fontSize={'12px'}
      fontStyle={'normal'}
      fontWeight={'500'}
      lineHeight={'16px'}
      letterSpacing={'0.5px'}
    >
      POST
    </Box>
  );
};

export const GET = () => {
  return (
    <Box
      display={'inline-flex'}
      padding={'2px 4px'}
      justifyContent={'center'}
      alignItems={'center'}
      gap={'10px'}
      borderRadius={'4px'}
      background={'#EDFBF3'}
      color={'#039855'}
      fontFamily={'PingFang SC'}
      fontSize={'12px'}
      fontStyle={'normal'}
      fontWeight={'500'}
      lineHeight={'16px'}
      letterSpacing={'0.5px'}
    >
      GET
    </Box>
  );
};

export const PUT = () => {
  return (
    <Box
      display={'inline-flex'}
      padding={'2px 4px'}
      justifyContent={'center'}
      alignItems={'center'}
      gap={'10px'}
      borderRadius={'4px'}
      background={'#F0FBFF'}
      color={'#219BF4'}
      fontFamily={'PingFang SC'}
      fontSize={'12px'}
      fontStyle={'normal'}
      fontWeight={'500'}
      lineHeight={'16px'}
      letterSpacing={'0.5px'}
    >
      PUT
    </Box>
  );
};

export const DELETE = () => {
  return (
    <Box
      display={'inline-flex'}
      padding={'2px 4px'}
      justifyContent={'center'}
      alignItems={'center'}
      gap={'10px'}
      borderRadius={'4px'}
      background={'#FEF2F2'}
      color={'#F04438'}
      fontFamily={'PingFang SC'}
      fontSize={'12px'}
      fontStyle={'normal'}
      fontWeight={'500'}
      lineHeight={'16px'}
      letterSpacing={'0.5px'}
    >
      DELETE
    </Box>
  );
};

export const PATCH = () => {
  return (
    <Box
      display={'inline-flex'}
      padding={'2px 4px'}
      justifyContent={'center'}
      alignItems={'center'}
      gap={'10px'}
      borderRadius={'4px'}
      background={'#F0EEFF'}
      color={'#6F5DD7'}
      fontFamily={'PingFang SC'}
      fontSize={'12px'}
      fontStyle={'normal'}
      fontWeight={'500'}
      lineHeight={'16px'}
      letterSpacing={'0.5px'}
    >
      PATCH
    </Box>
  );
};

// Other HTTP Method
export const OTHER = ({ children }: { children: string }) => {
  return (
    <Box
      display={'inline-flex'}
      padding={'2px 4px'}
      justifyContent={'center'}
      alignItems={'center'}
      gap={'10px'}
      borderRadius={'4px'}
      background={'#F0EEFF'}
      color={'#6F5DD7'}
      fontFamily={'PingFang SC'}
      fontSize={'12px'}
      fontStyle={'normal'}
      fontWeight={'500'}
      lineHeight={'16px'}
      letterSpacing={'0.5px'}
    >
      {children}
    </Box>
  );
};
