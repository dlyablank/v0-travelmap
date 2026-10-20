import { S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'weekend_local',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'weekend_local_dev_only',
  },
});
const Bucket = process.env.S3_BUCKET || 'weekend';
async function main() {
  try {
    await client.send(new HeadBucketCommand({ Bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket }));
  }
  console.log('Private media bucket ready. Media is served through /api/media/.');
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
