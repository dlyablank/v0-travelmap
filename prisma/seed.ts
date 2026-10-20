import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { places } from '../lib/data';
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
async function main() {
  for (const p of places) {
    const data = {
      id: p.id,
      name: p.name,
      description: p.description,
      latitude: p.latitude,
      longitude: p.longitude,
      city: p.city,
      region: p.region,
      category: p.category,
      thumbnailUrl: p.thumbnailUrl,
      visitMinutes: p.visitMinutes,
    };
    await db.place.upsert({ where: { id: p.id }, update: data, create: data });
  }
  console.log(`Seeded ${places.length} real places`);
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
