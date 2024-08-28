import { Module } from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { SandboxController } from './sandbox.controller';

@Module({
  controllers: [SandboxController],
  providers: [SandboxService]
})
export class SandboxModule {}
