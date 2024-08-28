import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { getErrText } from './utils';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    response.status(500).send({
      success: false,
      time: new Date(),
      message: getErrText(error)
    });
  }
}
