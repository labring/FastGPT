import { storageIntegrationProviders } from '../providers';
import { runStorageAdapterContract } from './storage.contract';

for (const provider of storageIntegrationProviders) {
  runStorageAdapterContract(provider);
}
