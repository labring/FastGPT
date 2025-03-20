import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { RunCodeDto } from './dto/create-sandbox.dto';
import { runJsSandbox, runPythonSandbox } from './utils';

@Controller('sandbox')
export class SandboxController {
  constructor() {}

  @Post('/js')
  @HttpCode(200)
  runJs(@Body() codeProps: RunCodeDto) {
    return runJsSandbox(codeProps);
  }

  @Post('/python')
  @HttpCode(200)
  runPython(@Body() codeProps: RunCodeDto) {
    return runPythonSandbox(codeProps);
  }
}
