import { Controller, Post, Body } from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { RunCodeDto } from './dto/create-sandbox.dto';
import { WorkerNameEnum, runWorker } from 'src/worker/utils';

@Controller('sandbox')
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Post('/js')
  runJs(@Body() codeProps: RunCodeDto) {
    return runWorker(WorkerNameEnum.runJs, codeProps);
  }
}
