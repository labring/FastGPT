import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { RunCodeDto, RunCodeResponse } from './dto/create-sandbox.dto';
import { WorkerNameEnum, runWorker } from 'src/worker/utils';

@Controller('sandbox')
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Post('/js')
  @HttpCode(200)
  runJs(@Body() codeProps: RunCodeDto) {
    return runWorker<RunCodeResponse>(WorkerNameEnum.runJs, codeProps);
  }
}
