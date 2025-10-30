import type { NextPageContext } from 'next';
import { useTranslation } from 'next-i18next';
import { Box, Button, Container, Heading, Text } from '@chakra-ui/react';
import { useRouter } from 'next/router';

function ErrorPage({ statusCode }: { statusCode: number }) {
  const { t } = useTranslation('common');
  const router = useRouter();

  return (
    <Container maxW="container.md" py={20}>
      <Box textAlign="center">
        <Heading fontSize="6xl" mb={4}>
          {statusCode}
        </Heading>
        <Text fontSize="xl" mb={8} color="gray.600">
          {statusCode === 404 ? 'Page not found' : 'Something went wrong'}
        </Text>
        <Button colorScheme="blue" onClick={() => router.push('/')}>
          Go back home
        </Button>
      </Box>
    </Container>
  );
}

ErrorPage.getInitialProps = async ({ res, err }: NextPageContext) => {
  const statusCode = res?.statusCode || err?.statusCode || 404;
  return { statusCode };
};

export default ErrorPage;
