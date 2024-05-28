import { Test, TestingModule } from '@nestjs/testing';
import { SandboxController } from './sandbox.controller';
import { SandboxService } from './sandbox.service';

describe('SandboxController', () => {
  let controller: SandboxController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SandboxController],
      providers: [SandboxService]
    }).compile();

    controller = module.get<SandboxController>(SandboxController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
