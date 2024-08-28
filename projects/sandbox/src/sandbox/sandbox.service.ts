import { Injectable } from '@nestjs/common';
import { RunCodeDto } from './dto/create-sandbox.dto';

@Injectable()
export class SandboxService {
  runJs(params: RunCodeDto) {
    return {};
  }
}
