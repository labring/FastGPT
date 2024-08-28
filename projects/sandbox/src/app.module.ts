import { Module } from '@nestjs/common';
import { SandboxController } from './sandbox/sandbox.controller';
import { SandboxService } from './sandbox/sandbox.service';

@Module({
  imports: [],
  controllers: [SandboxController],
  providers: [SandboxService]
})
export class AppModule {}
