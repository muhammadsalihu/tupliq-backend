import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Same seed content as the mobile app's constants/hackathons.ts, so the
// backend has something real to test against immediately after deploy.
async function main() {
  const circuitSprint = await prisma.hackathon.create({
    data: {
      title: 'Circuit Sprint: Campus AI Build',
      tag: 'Live',
      desc: 'A 48-hour build sprint for students shipping AI-powered tools. Form a team of up to 4, pick a track, and demo live to a panel of founders and engineers judging on craft, not just polish.',
      meta: '48 hours · Teams of 1-4 · Starts Jul 18',
      lessons: {
        create: [
          { title: 'Scoping an MVP in 48 hours', position: 0 },
          { title: 'Picking an AI stack that ships fast', position: 1 },
          { title: 'Demo storytelling for judges', position: 2 },
        ],
      },
      videos: {
        create: [
          { title: 'Kickoff & rules walkthrough', duration: '6:12', position: 0 },
          { title: 'Last year’s winning demo, breakdown', duration: '9:40', position: 1 },
        ],
      },
      partners: {
        create: [
          { name: 'Anthropic', position: 0 },
          { name: 'Vercel', position: 1 },
          { name: 'Notion', position: 2 },
        ],
      },
    },
  });

  await prisma.hackathon.create({
    data: {
      title: 'Green Grid Hardware Hack',
      tag: 'Upcoming',
      desc: 'Build hardware + software prototypes tackling campus energy efficiency. Sensors, dashboards, and control systems welcome — bring your own board or use one from the partner kit.',
      meta: '36 hours · Teams of 2-5 · Starts Aug 9',
      lessons: {
        create: [
          { title: 'Reading a sensor datasheet fast', position: 0 },
          { title: 'Wiring a safe low-voltage rig', position: 1 },
        ],
      },
      videos: {
        create: [{ title: 'Partner kit unboxing', duration: '4:55', position: 0 }],
      },
      partners: {
        create: [
          { name: 'Arduino', position: 0 },
          { name: 'Raspberry Pi Foundation', position: 1 },
        ],
      },
    },
  });

  await prisma.hackathon.create({
    data: {
      title: 'Fintech for Students Challenge',
      tag: 'Upcoming',
      desc: 'Design and build a tool that helps students manage money — budgeting, split expenses, or financial literacy. Solo builders and teams both welcome.',
      meta: '24 hours · Solo or team · Starts Sep 5',
      lessons: {
        create: [{ title: 'Payments 101 for hackers', position: 0 }],
      },
      partners: {
        create: [{ name: 'Stripe', position: 0 }],
      },
    },
  });

  // One ready-to-use invite code for the live hackathon, for manual testing.
  await prisma.inviteCode.create({
    data: {
      code: 'RACE-4821',
      hackathonId: circuitSprint.id,
    },
  });

  console.log('Seed complete. Try invite code RACE-4821 for "Circuit Sprint: Campus AI Build".');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
