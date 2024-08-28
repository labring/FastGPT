import { Test, TestingModule } from '@nestjs/testing';
import { SandboxService } from './sandbox.service';

describe('SandboxService', () => {
  let service: SandboxService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SandboxService]
    }).compile();

    service = module.get<SandboxService>(SandboxService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
