import app from '@/apiRouter/routers/app';
import { createServerRoute } from '@fastgpt/global/common/tsRest/server';

export default createServerRoute({
  app
});
