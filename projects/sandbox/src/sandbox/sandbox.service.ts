import { Injectable } from '@nestjs/common';
import { RunCodeDto } from './dto/create-sandbox.dto';
import { WorkerNameEnum, runWorker } from 'src/worker/utils';

@Injectable()
export class SandboxService {
  runJs(params: RunCodeDto) {
    return runWorker(WorkerNameEnum.runJs, params);
  }
}
