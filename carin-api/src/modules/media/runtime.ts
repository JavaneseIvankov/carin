import type { AppConfig } from '../../config.js';
import type { Database } from '../../db/client.js';
import { createMediaRepository } from './repository.js';
import { createMinioMediaObjectStore } from './storage.js';
import type { MediaServiceOptions } from './service.js';

/** Builds the same private media seams for HTTP uploads and worker photo reads. */
export function createMediaRuntimeOptions(db: Database, config: AppConfig): MediaServiceOptions {
  if (!config.minioEndpoint || !config.minioBucket || !config.minioAccessKey ||
      !config.minioSecretKey || !config.mediaSigningSecret || !config.mediaSignedUrlBase) {
    throw new Error('Private photo storage configuration is required');
  }
  return {
    repository: createMediaRepository(db),
    store: createMinioMediaObjectStore({
      endpoint: config.minioEndpoint,
      bucket: config.minioBucket,
      accessKey: config.minioAccessKey,
      secretKey: config.minioSecretKey,
    }),
    environment: config.appEnv,
    signingSecret: config.mediaSigningSecret,
    publicApiOrigin: config.mediaSignedUrlBase,
    minioEndpoint: config.minioEndpoint,
    minioBucket: config.minioBucket,
  };
}
