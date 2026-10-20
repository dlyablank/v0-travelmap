import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { storageClient } from '../lib/s3';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function main() {
  const records = await db.place.findMany({
    where: {
      name: { startsWith: 'Тестовое своё видео ' },
      description: 'Синтетическое тестовое видео. Не изображает реальное место.',
    },
    include: { videos: true },
  });
  for (const p of records) {
    for (const v of p.videos) {
      const key = v.playbackUrl?.match(/^\/api\/media\/(uploads\/[\da-f-]{36}\.mp4)$/)?.[1];
      if (key)
        await storageClient().send(
          new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
        );
    }
    await db.tripStop.deleteMany({ where: { placeId: p.id } });
    await db.place.delete({ where: { id: p.id } });
  }
  console.log(`Removed ${records.length} synthetic test places and media.`);
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
