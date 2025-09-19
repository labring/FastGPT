import app from '@/apiRouter/routers/app';
import support from '@/apiRouter/routers/support';
import { createServerRoute } from '@fastgpt/global/common/tsRest/server';

export default createServerRoute({
  app,
  support
});
