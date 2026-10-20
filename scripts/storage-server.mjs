import S3rver from 's3rver';
import { mkdir } from 'node:fs/promises';
const directory = process.env.LOCAL_STORAGE_DIR || '.storage';
await mkdir(directory, { recursive: true });
const server = new S3rver({
  address: '127.0.0.1',
  port: 9000,
  directory,
  silent: true,
  configureBuckets: [{ name: 'weekend' }],
});
await server.run();
console.log('Local S3 development storage listening on 127.0.0.1:9000 (persistent .storage/).');
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => server.close().then(() => process.exit()));
