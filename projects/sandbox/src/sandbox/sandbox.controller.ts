import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { RunCodeDto } from './dto/create-sandbox.dto';
import { runSandbox } from './utils';

@Controller('sandbox')
export class SandboxController {
  constructor() {}

  @Post('/js')
  @HttpCode(200)
  runJs(@Body() codeProps: RunCodeDto) {
    return runSandbox(codeProps);
  }
}
