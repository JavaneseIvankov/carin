import { Client as MinioClient } from 'minio';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const endpoint = new URL(required('MINIO_ENDPOINT'));
  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('MINIO_ENDPOINT must use HTTP or HTTPS');
  }

  const bucket = required('MINIO_BUCKET');
  const client = new MinioClient({
    endPoint: endpoint.hostname,
    port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === 'https:' ? 443 : 80,
    useSSL: endpoint.protocol === 'https:',
    accessKey: required('MINIO_ROOT_USER'),
    secretKey: required('MINIO_ROOT_PASSWORD'),
  });

  if (await client.bucketExists(bucket)) {
    console.info(`MinIO bucket is ready: ${bucket}`);
    return;
  }

  await client.makeBucket(bucket, 'us-east-1');
  console.info(`Created MinIO bucket: ${bucket}`);
}

main().catch((error: unknown) => {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : 'UNKNOWN';
  console.error(`Unable to ensure configured MinIO bucket (code=${code})`);
  process.exitCode = 1;
});
