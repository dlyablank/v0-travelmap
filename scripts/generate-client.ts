// Prisma's in-process generator uses the verified npm-distributed WASM compiler.
// Unlike the CLI bootstrap, it does not download an unused native migration engine.
// Keep these internal integration packages pinned together; the stock CLI remains
// available for migration commands where binaries.prisma.sh is reachable.
import { getGenerators } from '@prisma/internals';
import { PrismaClientJsGenerator } from '@prisma/client-generator-js';
async function main() {
  const generators = await getGenerators({
    schemaPath: 'prisma/schema.prisma',
    cliCommand: 'npm run db:generate',
    registry: {
      'prisma-client-js': {
        type: 'in-process',
        generator: new PrismaClientJsGenerator({ cliCommand: 'npm run db:generate' }),
      },
    },
  });
  try {
    for (const g of generators) await g.generate();
    console.log('Prisma client generated with the WASM compiler.');
  } finally {
    for (const g of generators) g.stop();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
