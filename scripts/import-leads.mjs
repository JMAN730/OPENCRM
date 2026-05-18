import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const leads = [
  { company: "Toledo RPM Mobile Mechanic", phone: "14197316708", rating: 4.4, reviewCount: 5, source: "Mobile Mechanics", city: "Toledo", state: "OH", mapsUrl: "https://www.google.com/maps/place/Toledo+RPM+Mobile+Mechanic/data=!4m7!3m6!1s0x883b87001b163655:0xe596aaf7997eeb10!8m2!3d41.6432122!4d-83.5174417!16s%2Fg%2F11y4bk17cz!19sChIJVTYWGwCHO4gREOt-mfeqluU?authuser=0&hl=en&rclk=1" },
  { company: "Baughman Mobile Truck Repair", phone: "14199001020", rating: 4.5, reviewCount: 54, source: "Mobile Mechanics", city: "Toledo", state: "OH", mapsUrl: "https://www.google.com/maps/place/Baughman+Mobile+Truck+Repair/data=!4m7!3m6!1s0x883b81cb0893cf3f:0xd328e08b29f73735!8m2!3d41.7156376!4d-83.5663602!16s%2Fg%2F11hzxsmzl6!19sChIJP8-TCMuBO4gRNTf3KYvgKNM?authuser=0&hl=en&rclk=1" },
  { company: "Mr Mobile Mechanic Pros of Toledo", phone: "14198458580", rating: 3.8, reviewCount: 30, source: "Mobile Mechanics", city: "Toledo", state: "OH", mapsUrl: "https://www.google.com/maps/place/Mr+Mobile+Mechanic+Pros+of+Toledo/data=!4m7!3m6!1s0x883b81f6939aa993:0x8606726868319671!8m2!3d41.6694691!4d-83.5370167!16s%2Fg%2F11h540zwh6!19sChIJk6mak_aBO4gRcZYxaGhyBoY?authuser=0&hl=en&rclk=1" },
  { company: "Super Toledo Mobile Truck Repair", phone: "14196587468", rating: 4.1, reviewCount: 27, source: "Mobile Mechanics", city: "Toledo", state: "OH", mapsUrl: "https://www.google.com/maps/place/Super+Toledo+Mobile+Truck+Repair/data=!4m7!3m6!1s0x883b87007abce4ef:0x2dfafe3186cdb2e6!8m2!3d41.6413264!4d-83.5409172!16s%2Fg%2F11y5f59nyh!19sChIJ7-S8egCHO4gR5rLNhjH--i0?authuser=0&hl=en&rclk=1" },
  { company: "Ride Aid Mobile Mechanic LLC", phone: "15673174756", rating: 4.4, reviewCount: 7, source: "Mobile Mechanics", city: "Toledo", state: "OH", mapsUrl: "https://www.google.com/maps/place/Ride+Aid+Mobile+Mechanic+LLC/data=!4m7!3m6!1s0x6d58e6b94cfbd765:0x6b3e8c59db016464!8m2!3d41.4710461!4d-83.183837!16s%2Fg%2F11lthphlrs!19sChIJZdf7TLnmWG0RZGQB21mMPms?authuser=0&hl=en&rclk=1" },
  { company: "Mallery auto repair", phone: "15674409757", rating: 5.0, reviewCount: 12, source: "Mobile Mechanics", city: "Toledo", state: "OH", mapsUrl: "https://www.google.com/maps/place/Mallery+auto+repair/data=!4m7!3m6!1s0x883b81fe0fe12427:0xa17bcc390e552f8d!8m2!3d41.6812632!4d-83.5240184!16s%2Fg%2F11yc__x65z!19sChIJJyThD_6BO4gRjS9VDjnMe6E?authuser=0&hl=en&rclk=1" },
  { company: "Dave's Mobile mechanic roadside assistance and towing", phone: "15179189694", rating: 4.8, reviewCount: 21, source: "Mobile Mechanics", city: "Toledo", state: "OH", mapsUrl: "https://www.google.com/maps/place/Dave%27s+Mobile+mechanic,emergency+roadside+assistance+and+towing/data=!4m7!3m6!1s0x883c0d2b93ec613d:0xaab5a00dee7e30d3!8m2!3d41.4088153!4d-83.6520444!16s%2Fg%2F11x6nrc_4_!19sChIJPWHskysNPIgR0zB-7g2gtao?authuser=0&hl=en&rclk=1" },
  { company: "Ryan's Mobile Mechanics", phone: "14193602093", rating: 4.2, reviewCount: 5, source: "Mobile Mechanics", city: "Toledo", state: "OH", website: "https://www.facebook.com/ryansmobilemechanictoledo", mapsUrl: "https://www.google.com/maps/place/Ryan%27s+Mobile+Mechanics/data=!4m7!3m6!1s0x883b85f7f415d7a5:0xa5b42c0d841afcf0!8m2!3d39.701812!4d-102.7414494!16s%2Fg%2F11ss5bqjrz!19sChIJpdcV9PeFO4gR8PwahA0stKU?authuser=0&hl=en&rclk=1" },
  { company: "Mobile Auto Experts LLC", phone: "14199300003", rating: 5.0, reviewCount: 1, source: "Mobile Mechanics", city: "Toledo", state: "OH", mapsUrl: "https://www.google.com/maps/place/Mobile+Auto+Experts+LLC/data=!4m7!3m6!1s0x883b87673386e155:0xc4764955976393bd!8m2!3d41.6436737!4d-83.6070224!16s%2Fg%2F11y03n_0dz!19sChIJVeGGM2eHO4gRvZNjl1VJdsQ?authuser=0&hl=en&rclk=1" },
  { company: "BO'S AUTOMOTIVE AND MOBILE SERVICES", phone: "15678069059", rating: 4.7, reviewCount: 71, source: "Mobile Mechanics", city: "Toledo", state: "OH", mapsUrl: "https://www.google.com/maps/place/BO%27S+AUTOMOTIVE+AND+MOBILE+SERVICES/data=!4m7!3m6!1s0xa8b1ffa54582e38b:0x83a157cc52435a6b!8m2!3d41.8849505!4d-84.3351705!16s%2Fg%2F11v09gbkzf!19sChIJi-OCRaX_sagRa1pDUsxXoYM?authuser=0&hl=en&rclk=1" },
  { company: "Semper Fi Mobile Mechanic LLC", phone: "16148221790", rating: 4.7, reviewCount: 449, source: "Mobile Mechanics", city: "Toledo", state: "OH", website: "https://youtube.com/@semperfimechanic", mapsUrl: "https://www.google.com/maps/place/Semper+Fi+Mobile+Mechanic+LLC/data=!4m7!3m6!1s0x88388558f35eb6b7:0x335e0ed5ea9915ee!8m2!3d39.9830215!4d-82.9781944!16s%2Fg%2F11ssdbjpwz!19sChIJt7Ze81iFOIgR7hWZ6tUOXjM?authuser=0&hl=en&rclk=1" },
];

async function main() {
  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) { console.error("No organization found"); process.exit(1); }

  const user = await prisma.user.findFirst({ where: { organizationId: org.id }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!user) { console.error("No user found"); process.exit(1); }

  const phones = leads.map(function(l) { return l.phone; });
  const existing = await prisma.lead.findMany({
    where: { organizationId: org.id, phone: { in: phones } },
    select: { phone: true },
  });
  const existingPhones = new Set(existing.map(function(l) { return l.phone; }));

  const toCreate = leads
    .filter(function(l) { return !existingPhones.has(l.phone); })
    .map(function(l) {
      return Object.assign({}, l, { organizationId: org.id, assignedToId: user.id, status: "NOT_CONTACTED" });
    });

  if (toCreate.length === 0) {
    console.log("All leads already exist — nothing imported.");
  } else {
    await prisma.lead.createMany({ data: toCreate });
    console.log("Imported " + toCreate.length + " leads into \"" + org.name + "\" (skipped " + (leads.length - toCreate.length) + " duplicates)");
  }

  await prisma["$disconnect"]();
}

main().catch(function(e) { console.error(e); process.exit(1); });
