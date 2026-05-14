import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { subDays, subHours, subMinutes } from "date-fns";
// ── Name pools ───────────────────────────────────────────────────────────────

const FIRST = [
  "James","Mary","Robert","Patricia","John","Jennifer","Michael","Linda",
  "William","Barbara","David","Susan","Richard","Jessica","Joseph","Sarah",
  "Thomas","Karen","Charles","Lisa","Christopher","Nancy","Daniel","Betty",
  "Matthew","Margaret","Anthony","Sandra","Mark","Ashley","Donald","Dorothy",
  "Steven","Kimberly","Paul","Emily","Andrew","Donna","Joshua","Michelle",
  "Kevin","Carol","Brian","Amanda","George","Melissa","Edward","Deborah",
  "Ronald","Stephanie",
];

const LAST = [
  "Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis",
  "Wilson","Martinez","Anderson","Taylor","Thomas","Hernandez","Moore","Martin",
  "Jackson","Thompson","White","Lopez","Lee","Gonzalez","Harris","Clark",
  "Lewis","Robinson","Walker","Perez","Hall","Young","Allen","Sanchez",
  "Wright","King","Scott","Green","Baker","Adams","Nelson","Hill",
  "Ramirez","Campbell","Mitchell","Roberts","Carter","Phillips","Evans","Turner",
  "Torres","Parker","Collins","Edwards","Stewart","Morris","Nguyen","Murphy",
];

const SERVICE_TYPES = [
  ["Landscaping","Lawn Care","Grounds Maintenance","Lawn Services","Yard Works"],
  ["Power Washing","Pressure Washing","Exterior Cleaning","Surface Cleaning"],
  ["Mobile Mechanics","Auto Repair","Mobile Auto Service","On-Site Auto"],
  ["Tree Service","Tree Removal","Tree Care","Arborist Services","Tree & Stump"],
  ["Cleaning Services","Maid Services","Janitorial","Home Cleaning"],
  ["Concrete Works","Concrete Services","Flatwork Concrete","Paving & Concrete"],
  ["Fencing","Fence Installation","Fence & Gate","Fence Solutions"],
];

const SOURCES = [
  "GoogleMaps / Landscaping / Toledo, Ohio",
  "GoogleMaps / Power washing Business / Toledo, Ohio",
  "GoogleMaps / Mobile Mechanics / Toledo, Ohio",
  "GoogleMaps / Tree Removal / Maumee, Ohio",
  "GoogleMaps / Cleaning / Perrysburg, Ohio",
  "GoogleMaps / Concrete / Sylvania, Ohio",
  "GoogleMaps / Fencing Companies / Holland, Ohio",
  "GoogleMaps / Landscaping / Maumee, Ohio",
  "GoogleMaps / Power washing Business / Perrysburg, Ohio",
  "GoogleMaps / Tree Removal / Findlay, Ohio",
  "GoogleMaps / Cleaning / Bowling Green, Ohio",
  "GoogleMaps / Concrete / Toledo, Ohio",
  "GoogleMaps / Landscaping / Northwood, Ohio",
];

function lead(i: number) {
  const first = FIRST[i % FIRST.length];
  const last  = LAST[(i * 7 + 13) % LAST.length];
  const group = SERVICE_TYPES[i % SERVICE_TYPES.length];
  const type  = group[(i * 3 + 1) % group.length];
  const company = `${last} ${type}`;
  const area = i % 2 === 0 ? "419" : "313";
  const exchanges = ["555","432","678","987","234","765","890","321"];
  const exchange = exchanges[i % exchanges.length];
  const num = String(1000 + ((i * 37 + 419) % 9000));
  const phone = `${area}${exchange}${num}`;
  const source = SOURCES[i % SOURCES.length];
  return { first, last, company, phone, source };
}

// WON deals in last 30 days — sum = $7,862
const WON_VALUES   = [380, 450, 320, 610, 280, 490, 420, 560, 340, 680, 295, 520, 380, 460, 310, 590, 430, 347];
const WON_DAYS_AGO = [  1,   2,   3,   4,   5,   6,   7,   9,  10,  11,  12,  14,  16,  18,  20,  22,  25,  28];

async function main() {
  console.log("🌱 Seeding demo account...");

  // ── Wipe existing demo data ───────────────────────────────────────────────
  const existing = await prisma.organization.findFirst({ where: { name: "Demo Company" } });
  if (existing) {
    console.log("   Removing existing demo data...");
    const orgId = existing.id;
    const leadIds = (await prisma.lead.findMany({ where: { organizationId: orgId }, select: { id: true } })).map(l => l.id);
    await prisma.task.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.note.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.callLog.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.activity.deleteMany({ where: { leadId: { in: leadIds } } });
    await prisma.lead.deleteMany({ where: { organizationId: orgId } });
    await prisma.scraperJob.deleteMany({ where: { organizationId: orgId } });
    const orgUsers = await prisma.user.findMany({ where: { organizationId: orgId }, select: { id: true } });
    for (const u of orgUsers) {
      await prisma.task.deleteMany({ where: { userId: u.id, leadId: null } });
    }
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }

  // ── Org + user ────────────────────────────────────────────────────────────
  const org  = await prisma.organization.create({ data: { name: "Demo Company" } });
  const user = await prisma.user.create({
    data: {
      name: "Demo User",
      email: "demo@example.com",
      password: await bcrypt.hash("demo", 10),
      role: "ADMIN",
      organizationId: org.id,
    },
  });
  console.log(`   Org: ${org.name}  |  User: demo@example.com / demo`);

  // ── Build lead records ───────────────────────────────────────────────────
  // Distribution that totals 463:
  //   18 CONNECTED  recent  ($7,862 revenue, last 30 days)
  //   20 CONNECTED  older   (31-90 days ago)
  //   17 AI_VOICEMAIL
  //  153 NO_ANSWER
  //  195 NOT_CONTACTED  (185 + 10 merged)
  //   60 HUNG_UP

  const rows: Prisma.LeadCreateManyInput[] = [];
  let i = 0;

  const push = (status: string, daysAgo: number, value?: number) => {
    const l = lead(i++);
    const d = subDays(new Date(), daysAgo);
    rows.push({
      firstName: l.first, lastName: l.last, company: l.company,
      phone: l.phone, source: l.source,
      status, value, createdAt: d, updatedAt: d,
      organizationId: org.id, assignedToId: user.id,
    });
  };

  // 18 CONNECTED recent (with revenue value)
  for (let k = 0; k < 18; k++) push("CONNECTED", WON_DAYS_AGO[k], WON_VALUES[k]);
  // 20 CONNECTED older
  for (let k = 0; k < 20; k++) push("CONNECTED", 31 + k * 3);
  // 17 AI_VOICEMAIL
  for (let k = 0; k < 17; k++) push("AI_VOICEMAIL", 3 + (k % 45));
  // 153 NO_ANSWER
  for (let k = 0; k < 153; k++) push("NO_ANSWER", 1 + (k % 60));
  // 195 NOT_CONTACTED
  for (let k = 0; k < 195; k++) push("NOT_CONTACTED", 1 + (k % 30));
  // 60 HUNG_UP
  for (let k = 0; k < 60; k++) push("HUNG_UP", 10 + (k % 90));

  // Create leads in batches of 50 to keep each insert payload bounded.
  const BATCH = 50;
  for (let b = 0; b < rows.length; b += BATCH) {
    await prisma.lead.createMany({ data: rows.slice(b, b + BATCH) });
    process.stdout.write(`\r   Leads created: ${Math.min(b + BATCH, rows.length)}/${rows.length}`);
  }
  console.log();

  // ── Call logs (last 30 days, ~8-14 calls/day) ────────────────────────────
  const leadIds = (await prisma.lead.findMany({
    where: { organizationId: org.id },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  })).map(l => l.id);

  const CALL_STATUSES = [
    "CONNECTED","CONNECTED","CONNECTED",
    "NO_ANSWER","NO_ANSWER","NO_ANSWER",
    "BUSY","FAILED",
  ] as const;

  const callRows: Prisma.CallLogCreateManyInput[] = [];
  let callIdx = 0;
  for (let day = 29; day >= 0; day--) {
    const n = 8 + (callIdx % 7);
    for (let c = 0; c < n; c++) {
      const status = CALL_STATUSES[callIdx % CALL_STATUSES.length];
      // Today's calls spread evenly across the last 4 hours; older days use normal offsets
      const createdAt = day === 0
        ? subMinutes(new Date(), Math.floor((c / n) * 240))
        : subMinutes(subHours(subDays(new Date(), day), 8 + (c % 10)), c * 3);
      callRows.push({
        leadId: leadIds[callIdx % leadIds.length],
        userId: user.id,
        status,
        duration: status === "CONNECTED" ? 60 + ((callIdx * 47) % 360) : null,
        createdAt,
      });
      callIdx++;
    }
  }
  for (let b = 0; b < callRows.length; b += BATCH) {
    await prisma.callLog.createMany({ data: callRows.slice(b, b + BATCH) });
    process.stdout.write(`\r   Calls created: ${Math.min(b + BATCH, callRows.length)}/${callRows.length}`);
  }
  console.log();

  // ── Tasks ────────────────────────────────────────────────────────────────
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const taskTitles = ["Follow up call","Send proposal","Check in email","Schedule demo","Confirm appointment","Send quote","Leave voicemail","Email brochure","Schedule callback","Confirm meeting","Send contract","Check in","Initial call","Send intro email","Close deal"];

  for (let k = 0; k < 5; k++) {
    await prisma.task.create({ data: { title: taskTitles[k], userId: user.id, leadId: leadIds[k], dueDate: today, completed: false } });
  }
  for (let k = 0; k < 8; k++) {
    await prisma.task.create({ data: { title: taskTitles[5 + k], userId: user.id, leadId: leadIds[5 + k], dueDate: subDays(new Date(), -(k + 1)), completed: false } });
  }
  for (let k = 0; k < 6; k++) {
    await prisma.task.create({ data: { title: taskTitles[k], userId: user.id, leadId: leadIds[13 + k], dueDate: subDays(new Date(), k + 1), completed: true } });
  }

  // ── Notes on a few CONNECTED leads ──────────────────────────────────────
  const wonIds = (await prisma.lead.findMany({ where: { organizationId: org.id, status: "CONNECTED" }, take: 5, select: { id: true } })).map(l => l.id);
  const noteTexts = [
    "Great client — responded quickly and signed same day.",
    "Needed two follow-ups before closing. Good fit for upsell next quarter.",
    "Referred by a previous customer. Very smooth close.",
    "Had concerns about pricing initially, offered a small discount to close.",
    "Booked for a recurring monthly contract.",
  ];
  for (let k = 0; k < wonIds.length; k++) {
    await prisma.note.create({ data: { content: noteTexts[k], leadId: wonIds[k], userId: user.id, createdAt: subDays(new Date(), k + 1) } });
  }

  const totalLeads = await prisma.lead.count({ where: { organizationId: org.id } });
  const totalCalls = await prisma.callLog.count({ where: { lead: { organizationId: org.id } } });
  console.log(`\n✅ Done!`);
  console.log(`   Leads: ${totalLeads}  |  Calls: ${totalCalls}  |  Revenue: $7,862`);
  console.log(`\n   Login: demo@example.com  /  demo`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
