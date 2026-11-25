import { PrismaClient } from '@prisma/client';
import controlsData from '../data/controls.json';

const prisma = new PrismaClient();

async function main() {
  if (process.env.PORTABLE_INIT !== '1') throw new Error('Use the Docker init service for this portable package.');
  console.log('Seeding control definitions...');

  // Upsert all 50 controls
  for (let i = 0; i < controlsData.length; i++) {
    const c = controlsData[i] as any;
    await prisma.controlDefinition.upsert({
      where: { controlId: c.controlId },
      update: process.env.PORTABLE_INIT === '1' ? {} : {
        domain: c.domain,
        controlName: c.controlName,
        question: c.question,
        evidenceReqs: c.evidenceReqs,
        testProcedure: c.testProcedure,
        passCriteria: c.passCriteria,
        sortOrder: i + 1,
      },
      create: {
        controlId: c.controlId,
        domain: c.domain,
        controlName: c.controlName,
        question: c.question,
        evidenceReqs: c.evidenceReqs,
        testProcedure: c.testProcedure,
        passCriteria: c.passCriteria,
        sortOrder: i + 1,
      },
    });
  }
  console.log(`Seeded ${controlsData.length} controls.`);

  // Local containers seed controls only; never reset users or create shared credentials.
  if (process.env.PORTABLE_INIT === '1') return;


}

main()
  .catch((e: any) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
