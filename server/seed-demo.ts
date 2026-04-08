import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { jobs, cashDrops, cashDropAttempts, businessCandidateUnlocks, reviews, walletTransactions } from "@shared/schema";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export const DEMO_CONSUMER_EMAIL = "demo.consumer@guberapp.internal";
export const DEMO_BUSINESS_EMAIL = "demo.business@guberapp.internal";

export async function seedDemoAccounts() {
  try {
    await seedDemoConsumer();
    await seedDemoBusinessUser();
    await seedNationwideJobs();
    await seedNationwideCashDrops();
    await seedDemoReviewsAndWallet();
    console.log("[GUBER] Demo accounts seeded.");
  } catch (e) {
    console.error("[GUBER] Demo seed error:", e);
  }
}

async function seedDemoConsumer() {
  let existing = await storage.getUserByEmail(DEMO_CONSUMER_EMAIL);

  if (!existing) {
    const pw = await hashPassword("GuberDemo2026!");
    existing = await storage.createUser({
      email: DEMO_CONSUMER_EMAIL,
      username: "demo_consumer_guber",
      fullName: "Alex Rivera",
      password: pw,
      role: "buyer",
      tier: "community",
      accountType: "personal",
      guberId: "GUB-DEMO001",
      publicUsername: "alexrivera_guber",
      referralCode: "DEMOALX",
      zipcode: "90210",
      lat: 34.0522,
      lng: -118.2437,
      skills: "Delivery,General Labor,Moving Help,Cleaning,Handyman,Property Inspection,Vehicle Check",
      userBio: "Reliable and fast. Day-1 OG member. 47 jobs completed, $7,800+ earned. Always on time, never cancelled.",
      termsAcceptedAt: new Date("2026-01-15"),
    });

    await storage.createNotification({ userId: existing.id, title: "Welcome, Day-1 OG!", body: "You're a founding member of GUBER. Your OG badge is active and perks are live.", type: "system" });
    await storage.createNotification({ userId: existing.id, title: "Trust Box Active", body: "Your AI or Not subscription is active. Unlimited reviews and your Human Verified badge are live.", type: "system" });
    await storage.createNotification({ userId: existing.id, title: "Job Completed!", body: "Marcus Thompson confirmed your delivery job. $42 has been added to your wallet.", type: "job_update" });
    await storage.createNotification({ userId: existing.id, title: "Payout Sent!", body: "$520.00 sent to your bank account via Stripe Connect.", type: "system" });
    await storage.createNotification({ userId: existing.id, title: "Cash Drop Claimed!", body: "You successfully claimed the Downtown Cash Drop — $25 sent to your wallet.", type: "cash_drop" });
    await storage.createNotification({ userId: existing.id, title: "New Job Near You", body: "A General Labor job just posted 0.8 miles away — $65 for 3 hours.", type: "nearby_job" });
    await storage.createNotification({ userId: existing.id, title: "Elite Badge Earned!", body: "You've reached Elite status with 47 completed jobs and a 4.9 rating. You now appear first in search.", type: "system" });
    await storage.createNotification({ userId: existing.id, title: "Background Check Passed", body: "Your background check is clear. Business clients can now see your verified status.", type: "system" });
  }

  const userId = existing.id;

  await storage.updateUser(userId, {
    day1OG: true,
    trustBoxPurchased: true,
    aiOrNotUnlimitedText: true,
    aiOrNotCredits: 10,
    profileComplete: true,
    idVerified: true,
    selfieVerified: true,
    credentialVerified: true,
    badgeTier: "elite",
    badgeActive: true,
    jobsCompleted: 47,
    jobsAccepted: 49,
    jobsConfirmed: 47,
    isAvailable: true,
    backgroundCheckStatus: "passed",
    reliabilityScore: 99,
    onTimePct: 98,
    consecutiveOnTime: 23,
    proofConfidenceLevel: "ELITE",
    proofQualityScore: 95,
    proofConfidenceScore: 96,
    proofReportsSubmitted: 47,
    photosSubmitted: 142,
    gpsVerifiedJobs: 44,
    stripeAccountStatus: "active",
    vehicleInspections: 6,
    propertyChecks: 8,
    marketplaceVerifications: 3,
    salvageChecks: 2,
    userBio: "Reliable and fast. Day-1 OG member. 47 jobs completed, $7,800+ earned. Always on time, never cancelled.",
  });

  await db.execute(sql`
    UPDATE users SET
      rating = 4.9,
      review_count = 34,
      trust_score = 97
    WHERE id = ${userId} AND (rating IS DISTINCT FROM 4.9 OR review_count IS DISTINCT FROM 34 OR trust_score IS DISTINCT FROM 97)
  `);

  const existingJobs = await db.execute(sql`SELECT id FROM jobs WHERE posted_by_id = ${userId} LIMIT 1`);
  if (!existingJobs.rows.length) {
    await db.insert(jobs).values({
      title: "Help Moving Boxes — Apartment to Storage Unit",
      description: "Need help moving about 20 boxes from a 2-bedroom apartment to a storage unit nearby. 2–3 hours of work.",
      category: "General Labor", budget: 75, location: "West Hollywood, CA", locationApprox: "West Hollywood, CA", zip: "90046", lat: 34.0900, lng: -118.3617,
      status: "completed", postedById: userId, isPublished: true, isPaid: true, buyerConfirmed: true, helperConfirmed: true,
      payType: "fixed", finalPrice: 75, helperPayout: 60, platformFee: 15, completedAt: new Date("2026-03-10"), confirmedAt: new Date("2026-03-10"),
    });

    await db.insert(jobs).values({
      title: "Quick Delivery — Pickup from Store, Drop Off at Home",
      description: "Need someone to pick up a large item from Home Depot and deliver to my apartment. You'll need a truck or SUV.",
      category: "On-Demand Help", budget: 45, location: "Los Angeles, CA", locationApprox: "Los Angeles, CA", zip: "90028", lat: 34.0983, lng: -118.3267,
      status: "completed", postedById: userId, isPublished: true, isPaid: true, buyerConfirmed: true, helperConfirmed: true,
      payType: "fixed", finalPrice: 45, helperPayout: 36, platformFee: 9, completedAt: new Date("2026-03-18"), confirmedAt: new Date("2026-03-18"),
    });

    await db.insert(jobs).values({
      title: "Yard Cleanup — Leaf Blowing & Bagging",
      description: "Front and backyard cleanup. Leaf blowing, bagging, and hauling to curb. About 2 hours.",
      category: "General Labor", budget: 55, location: "Beverly Hills, CA", locationApprox: "Beverly Hills, CA", zip: "90210", lat: 34.0736, lng: -118.4004,
      status: "posted_public", postedById: userId, isPublished: true, isPaid: false, payType: "fixed",
    });

    await db.insert(jobs).values({
      title: "Trade: Lawn Mowing for Guitar Lessons",
      description: "I'll mow and edge your lawn (up to 1/4 acre) in exchange for 2 beginner guitar lessons.",
      category: "Barter Labor", budget: 0, barterOffering: "2 beginner guitar lessons (45 min each)", barterNeed: "Lawn mowing and edging — up to 1/4 acre", barterEstimatedValue: "$40–$60",
      location: "Los Angeles, CA", locationApprox: "Los Angeles, CA", zip: "90210", lat: 34.0522, lng: -118.2437,
      status: "posted_public", postedById: userId, isPublished: true, isPaid: false, payType: "barter",
    });

    await db.insert(jobs).values({
      title: "Vehicle Inspection — Pre-Purchase Check (Sedan)",
      description: "Need someone to inspect a used car before I buy it. Looking for visible damage, leaks, tire condition, and interior check.",
      category: "Verify & Inspect", budget: 55, location: "Burbank, CA", locationApprox: "Burbank, CA", zip: "91502", lat: 34.1808, lng: -118.3089,
      status: "completed", postedById: userId, isPublished: true, isPaid: true, buyerConfirmed: true, helperConfirmed: true,
      payType: "fixed", finalPrice: 55, helperPayout: 44, platformFee: 11, completedAt: new Date("2026-03-05"), confirmedAt: new Date("2026-03-05"),
    });
  }

  const existingDrop = await db.execute(sql`SELECT id FROM cash_drops WHERE title = 'Downtown LA Cash Drop (Demo)' LIMIT 1`);
  if (!existingDrop.rows.length) {
    const [drop] = await db.insert(cashDrops).values({
      title: "Downtown LA Cash Drop (Demo)",
      description: "A sponsored cash drop at Pershing Square — claim your reward!",
      rewardPerWinner: 25, winnerLimit: 5, winnersFound: 1, cashWinnerCount: 1, status: "completed",
      startTime: new Date("2026-03-20T14:00:00Z"), endTime: new Date("2026-03-20T16:00:00Z"),
      gpsLat: 34.0491, gpsLng: -118.2519, gpsRadius: 200,
      clueText: "Head to the heart of Downtown — the square where pigeons rule.",
      rewardType: "cash", fundingSource: "guber_cash_app", sponsorName: "GUBER", isSponsored: false,
    }).returning();

    await db.insert(cashDropAttempts).values({
      cashDropId: drop.id, userId, status: "winner",
      arrivedAt: new Date("2026-03-20T14:42:00Z"), submittedAt: new Date("2026-03-20T14:43:00Z"),
      gpsLat: 34.0491, gpsLng: -118.2519, payoutStatus: "sent", payoutMethod: "cashapp",
      payoutHandle: "$alexrivera_guber", payoutSentAt: new Date("2026-03-20T15:00:00Z"), fundedFromSource: "guber_cash_app",
    });
  }
}

async function seedDemoBusinessUser() {
  const existing = await storage.getUserByEmail(DEMO_BUSINESS_EMAIL);
  let userId: number;

  if (!existing) {
    const pw = await hashPassword("GuberBizDemo2026!");
    const bizUser = await storage.createUser({
      email: DEMO_BUSINESS_EMAIL, username: "demo_biz_guber", fullName: "Marcus Thompson", password: pw,
      role: "buyer", tier: "community", accountType: "business", guberId: "GUB-DEMO002",
      referralCode: "DEMOBIZ", zipcode: "90001", profileComplete: true, termsAcceptedAt: new Date("2026-01-20"),
      lat: 34.0522, lng: -118.2437,
    });
    userId = bizUser.id;

    await storage.createNotification({ userId, title: "Welcome to GUBER Business!", body: "Your business account is active. Start posting jobs and discovering local talent.", type: "system" });
    await storage.createNotification({ userId, title: "Subscription Active", body: "Your Growth plan is active. You have 20 candidate unlocks available this month.", type: "system" });
    await storage.createNotification({ userId, title: "New Application!", body: "Alex Rivera applied to your General Labor posting. View their profile to unlock contact details.", type: "job_update" });
  } else {
    userId = existing.id;
  }

  await storage.updateUser(userId, { accountType: "business", profileComplete: true });

  const existingBizAcct = await storage.getBusinessAccount(userId);
  let bizAcctId: number;

  if (existingBizAcct) {
    bizAcctId = existingBizAcct.id;
  } else {
    const bizAcct = await storage.createBusinessAccount({
      ownerUserId: userId, businessName: "Thompson Property Group", workEmail: DEMO_BUSINESS_EMAIL,
      phone: "(310) 555-0199", industry: "Property Management",
      companyNeedsSummary: "We regularly need reliable local workers for property maintenance, cleaning, and deliveries.",
      status: "verified_business", billingEmail: DEMO_BUSINESS_EMAIL,
      businessAddress: "1200 Wilshire Blvd, Los Angeles, CA 90017", authorizedContactName: "Marcus Thompson",
    });
    bizAcctId = bizAcct.id;
  }

  await db.execute(sql`UPDATE business_accounts SET status = 'verified_business', verified_at = NOW(), verification_fee_paid = true WHERE owner_user_id = ${userId}`);

  const existingPlan = await storage.getBusinessPlan(bizAcctId);
  if (!existingPlan) {
    await storage.createBusinessPlan({
      businessAccountId: bizAcctId, planType: "growth", status: "active",
      includedUnlocksPerMonth: 50, currentUnlockBalance: 38, renewsAt: new Date("2026-04-26"),
    });
  }

  const existingProfile = await db.execute(sql`SELECT id FROM business_profiles WHERE user_id = ${userId} LIMIT 1`);
  if (!existingProfile.rows.length) {
    await storage.createBusinessProfile({
      userId, companyName: "Thompson Property Group", companyLogo: null, billingEmail: DEMO_BUSINESS_EMAIL,
      industry: "Property Management", contactPerson: "Marcus Thompson", contactPhone: "(310) 555-0199",
      description: "A full-service property management company operating across LA County.",
      companyVerified: true, verifiedAt: new Date("2026-02-01"),
    });
  }

  const existingJobs = await db.execute(sql`SELECT id FROM jobs WHERE posted_by_id = ${userId} LIMIT 1`);
  if (!existingJobs.rows.length) {
    const consumerUser = await storage.getUserByEmail(DEMO_CONSUMER_EMAIL);
    const helperId = consumerUser?.id;

    await db.insert(jobs).values({
      title: "Property Walkthrough & Photo Report — Studio City", description: "Walk through a rental unit and submit a detailed photo report. Checklist provided.",
      category: "Verify & Inspect", budget: 85, location: "Studio City, CA", locationApprox: "Studio City, CA", zip: "91604", lat: 34.1395, lng: -118.3870,
      status: "posted_public", postedById: userId, isPublished: true, isPaid: false, payType: "fixed",
    });

    await db.insert(jobs).values({
      title: "General Cleaning — 3-Bedroom Turnover", description: "Full turnover cleaning for a 3-bedroom apartment. Tenant just moved out.",
      category: "General Labor", budget: 120, location: "Koreatown, LA", locationApprox: "Koreatown, LA", zip: "90006", lat: 34.0604, lng: -118.3016,
      status: "posted_public", postedById: userId, isPublished: true, isPaid: false, payType: "fixed",
    });

    await db.insert(jobs).values({
      title: "Skilled Electrician — Outlet Replacement (4 units)", description: "Need an experienced electrician to replace outlets in 4 units.",
      category: "Skilled Labor", budget: 200, location: "Burbank, CA", locationApprox: "Burbank, CA", zip: "91502", lat: 34.1808, lng: -118.3089,
      status: "posted_public", postedById: userId, isPublished: true, isPaid: false, payType: "fixed",
    });

    const completedBizJobs = [
      { title: "Delivery — Building Supplies to Storage Unit", cat: "On-Demand Help", budget: 65, payout: 52, fee: 13, date: "2026-03-12", loc: "Inglewood, CA", zip: "90301", lat: 33.9617, lng: -118.3531 },
      { title: "Apartment Cleaning — Turnover Unit 4B", cat: "General Labor", budget: 95, payout: 76, fee: 19, date: "2026-02-28", loc: "Downtown LA", zip: "90015", lat: 34.0407, lng: -118.2603 },
      { title: "Fence Post Repair — Backyard", cat: "Skilled Labor", budget: 150, payout: 120, fee: 30, date: "2026-02-20", loc: "Eagle Rock, CA", zip: "90041", lat: 34.1394, lng: -118.2103 },
      { title: "Tenant Move-Out Walkthrough", cat: "Verify & Inspect", budget: 75, payout: 60, fee: 15, date: "2026-02-15", loc: "Pasadena, CA", zip: "91101", lat: 34.1478, lng: -118.1445 },
      { title: "Drywall Patch — Kitchen Water Damage", cat: "Skilled Labor", budget: 180, payout: 144, fee: 36, date: "2026-02-10", loc: "Glendale, CA", zip: "91205", lat: 34.1425, lng: -118.2551 },
      { title: "Deep Clean — Common Areas Building A", cat: "General Labor", budget: 110, payout: 88, fee: 22, date: "2026-02-05", loc: "Koreatown, LA", zip: "90006", lat: 34.0604, lng: -118.3016 },
      { title: "Package Delivery — 3 Locations", cat: "On-Demand Help", budget: 55, payout: 44, fee: 11, date: "2026-01-30", loc: "Mid-City, LA", zip: "90019", lat: 34.0472, lng: -118.3464 },
      { title: "Property Photo Report — 2-Unit Duplex", cat: "Verify & Inspect", budget: 90, payout: 72, fee: 18, date: "2026-01-25", loc: "Silver Lake, CA", zip: "90026", lat: 34.0869, lng: -118.2673 },
      { title: "Bathroom Re-caulk — 3 Units", cat: "Skilled Labor", budget: 130, payout: 104, fee: 26, date: "2026-01-20", loc: "Hollywood, CA", zip: "90028", lat: 34.0983, lng: -118.3267 },
      { title: "Trash Haul & Cleanup — Vacant Lot", cat: "General Labor", budget: 85, payout: 68, fee: 17, date: "2026-01-18", loc: "Inglewood, CA", zip: "90301", lat: 33.9617, lng: -118.3531 },
      { title: "Appliance Delivery & Install", cat: "On-Demand Help", budget: 120, payout: 96, fee: 24, date: "2026-01-15", loc: "Culver City, CA", zip: "90230", lat: 34.0211, lng: -118.3965 },
      { title: "Vehicle Inspection — Fleet Van", cat: "Verify & Inspect", budget: 65, payout: 52, fee: 13, date: "2026-01-12", loc: "Burbank, CA", zip: "91502", lat: 34.1808, lng: -118.3089 },
      { title: "Garage Cleanout & Organize", cat: "General Labor", budget: 100, payout: 80, fee: 20, date: "2026-01-08", loc: "Sherman Oaks, CA", zip: "91403", lat: 34.1508, lng: -118.4489 },
      { title: "Plumbing Check — Dripping Faucets", cat: "Skilled Labor", budget: 110, payout: 88, fee: 22, date: "2026-01-05", loc: "Van Nuys, CA", zip: "91401", lat: 34.1867, lng: -118.4489 },
      { title: "Parking Lot Sweep & Line Touch-Up", cat: "General Labor", budget: 75, payout: 60, fee: 15, date: "2026-01-03", loc: "North Hollywood, CA", zip: "91601", lat: 34.1712, lng: -118.3795 },
      { title: "Roof Gutter Cleaning — 4 Units", cat: "General Labor", budget: 140, payout: 112, fee: 28, date: "2025-12-28", loc: "Atwater Village, CA", zip: "90039", lat: 34.1167, lng: -118.2589 },
      { title: "Smoke Detector Install — 6 Units", cat: "Skilled Labor", budget: 90, payout: 72, fee: 18, date: "2025-12-22", loc: "Echo Park, CA", zip: "90026", lat: 34.0782, lng: -118.2606 },
      { title: "Furniture Assembly — Model Unit", cat: "On-Demand Help", budget: 80, payout: 64, fee: 16, date: "2025-12-18", loc: "West Hollywood, CA", zip: "90046", lat: 34.0900, lng: -118.3617 },
      { title: "Property Inspection — Pre-Lease", cat: "Verify & Inspect", budget: 85, payout: 68, fee: 17, date: "2025-12-15", loc: "Pasadena, CA", zip: "91101", lat: 34.1478, lng: -118.1445 },
      { title: "Yard Maintenance — 2 Properties", cat: "General Labor", budget: 95, payout: 76, fee: 19, date: "2025-12-10", loc: "Alhambra, CA", zip: "91801", lat: 34.0953, lng: -118.1270 },
      { title: "Window Cleaning — 8-Unit Complex", cat: "General Labor", budget: 160, payout: 128, fee: 32, date: "2025-12-05", loc: "Montebello, CA", zip: "90640", lat: 34.0167, lng: -118.1137 },
      { title: "Cabinet Hardware Replacement", cat: "Skilled Labor", budget: 75, payout: 60, fee: 15, date: "2025-12-01", loc: "Whittier, CA", zip: "90602", lat: 33.9753, lng: -118.0328 },
      { title: "Holiday Light Install — Commercial", cat: "On-Demand Help", budget: 200, payout: 160, fee: 40, date: "2025-11-28", loc: "Beverly Hills, CA", zip: "90210", lat: 34.0736, lng: -118.4004 },
      { title: "Salvage Evaluation — Warehouse Items", cat: "Verify & Inspect", budget: 95, payout: 76, fee: 19, date: "2025-11-25", loc: "Commerce, CA", zip: "90040", lat: 33.9961, lng: -118.1597 },
      { title: "Pressure Washing — Driveway & Walkways", cat: "Skilled Labor", budget: 175, payout: 140, fee: 35, date: "2025-11-20", loc: "Arcadia, CA", zip: "91006", lat: 34.1397, lng: -118.0353 },
      { title: "Emergency Pipe Repair", cat: "Skilled Labor", budget: 250, payout: 200, fee: 50, date: "2025-11-15", loc: "Downtown LA", zip: "90015", lat: 34.0407, lng: -118.2603 },
      { title: "Carpet Cleaning — 5 Units", cat: "General Labor", budget: 225, payout: 180, fee: 45, date: "2025-11-10", loc: "Koreatown, LA", zip: "90006", lat: 34.0604, lng: -118.3016 },
      { title: "Fire Extinguisher Inspection & Replace", cat: "Verify & Inspect", budget: 70, payout: 56, fee: 14, date: "2025-11-05", loc: "Eagle Rock, CA", zip: "90041", lat: 34.1394, lng: -118.2103 },
      { title: "Mailbox Repair & Lock Replace", cat: "Skilled Labor", budget: 60, payout: 48, fee: 12, date: "2025-11-01", loc: "Glendale, CA", zip: "91205", lat: 34.1425, lng: -118.2551 },
      { title: "End-of-Lease Photo Documentation", cat: "Verify & Inspect", budget: 80, payout: 64, fee: 16, date: "2025-10-28", loc: "Burbank, CA", zip: "91502", lat: 34.1808, lng: -118.3089 },
    ];

    for (const j of completedBizJobs) {
      await db.insert(jobs).values({
        title: j.title, description: `Job completed by Alex Rivera for Thompson Property Group.`,
        category: j.cat, budget: j.budget, location: j.loc, locationApprox: j.loc, zip: j.zip, lat: j.lat, lng: j.lng,
        status: "completed", postedById: userId, assignedHelperId: helperId || undefined,
        isPublished: true, isPaid: true, buyerConfirmed: true, helperConfirmed: true,
        payType: "fixed", finalPrice: j.budget, helperPayout: j.payout, platformFee: j.fee, payoutStatus: "paid_out",
        completedAt: new Date(j.date), confirmedAt: new Date(j.date),
      });
    }
  }

  const existingUnlocks = await db.execute(sql`SELECT id FROM business_candidate_unlocks WHERE business_account_id = ${bizAcctId} LIMIT 1`);
  if (!existingUnlocks.rows.length) {
    const consumerUser = await storage.getUserByEmail(DEMO_CONSUMER_EMAIL);
    if (consumerUser) {
      await db.insert(businessCandidateUnlocks).values({
        businessAccountId: bizAcctId, userId: consumerUser.id, unlockSource: "plan", paymentReference: "demo_unlock_001",
      });
    }
    await db.execute(sql`
      INSERT INTO business_candidate_unlocks (business_account_id, user_id, unlock_source, payment_reference, created_at)
      SELECT ${bizAcctId}, id, 'plan', 'demo_unlock_00' || ROW_NUMBER() OVER (ORDER BY id) + 1, NOW() - INTERVAL '10 days'
      FROM users WHERE id != ${userId} AND role = 'buyer' AND profile_complete = TRUE
        AND id NOT IN (SELECT user_id FROM business_candidate_unlocks WHERE business_account_id = ${bizAcctId})
      LIMIT 2
    `);
  }

  const existingBilling = await db.execute(sql`SELECT id FROM billing_events WHERE business_account_id = ${bizAcctId} LIMIT 1`);
  if (!existingBilling.rows.length) {
    await db.execute(sql`
      INSERT INTO billing_events (business_account_id, event_type, status, raw_reference, processed_at)
      VALUES
        (${bizAcctId}, 'subscription_created', 'processed', 'demo_sub_001', NOW() - INTERVAL '30 days'),
        (${bizAcctId}, 'invoice_paid', 'processed', 'demo_inv_001', NOW() - INTERVAL '30 days'),
        (${bizAcctId}, 'unlock_credits_purchased', 'processed', 'demo_unlock_credits_001', NOW() - INTERVAL '15 days')
    `);
  }
}

async function seedNationwideJobs() {
  const consumer = await storage.getUserByEmail(DEMO_CONSUMER_EMAIL);
  const business = await storage.getUserByEmail(DEMO_BUSINESS_EMAIL);
  if (!consumer || !business) return;

  const marker = await db.execute(sql`SELECT id FROM jobs WHERE title LIKE '%GUBER Demo Seed%' LIMIT 1`);
  if (marker.rows.length) return;

  const cId = consumer.id;
  const bId = business.id;

  await db.insert(jobs).values({ title: "GUBER Demo Seed Marker", description: "Internal marker", category: "General Labor", budget: 0, location: "Internal", locationApprox: "Internal", zip: "00000", lat: 0, lng: 0, status: "cancelled", postedById: cId, isPublished: false, isPaid: false, payType: "fixed" });

  type Loc = { name: string; zip: string; lat: number; lng: number; weight: number };

  const majorCities: Loc[] = [
    { name: "Manhattan, NY", zip: "10001", lat: 40.7484, lng: -73.9967, weight: 8 },
    { name: "Brooklyn, NY", zip: "11201", lat: 40.6958, lng: -73.9936, weight: 6 },
    { name: "Queens, NY", zip: "11101", lat: 40.7433, lng: -73.9230, weight: 4 },
    { name: "Bronx, NY", zip: "10451", lat: 40.8176, lng: -73.9209, weight: 3 },
    { name: "Harlem, NY", zip: "10027", lat: 40.8116, lng: -73.9465, weight: 3 },
    { name: "Upper West Side, NY", zip: "10024", lat: 40.7870, lng: -73.9754, weight: 3 },
    { name: "Williamsburg, NY", zip: "11211", lat: 40.7081, lng: -73.9571, weight: 3 },
    { name: "Midtown, NY", zip: "10018", lat: 40.7549, lng: -73.9840, weight: 4 },
    { name: "Staten Island, NY", zip: "10301", lat: 40.6433, lng: -74.0772, weight: 2 },
    { name: "Downtown LA, CA", zip: "90015", lat: 34.0407, lng: -118.2603, weight: 7 },
    { name: "Hollywood, CA", zip: "90028", lat: 34.0983, lng: -118.3267, weight: 5 },
    { name: "West Hollywood, CA", zip: "90046", lat: 34.0900, lng: -118.3617, weight: 3 },
    { name: "Beverly Hills, CA", zip: "90210", lat: 34.0736, lng: -118.4004, weight: 3 },
    { name: "Koreatown, CA", zip: "90006", lat: 34.0604, lng: -118.3016, weight: 3 },
    { name: "Inglewood, CA", zip: "90301", lat: 33.9617, lng: -118.3531, weight: 3 },
    { name: "Burbank, CA", zip: "91502", lat: 34.1808, lng: -118.3089, weight: 3 },
    { name: "Pasadena, CA", zip: "91101", lat: 34.1478, lng: -118.1445, weight: 3 },
    { name: "Long Beach, CA", zip: "90802", lat: 33.7701, lng: -118.1937, weight: 3 },
    { name: "Santa Monica, CA", zip: "90401", lat: 34.0195, lng: -118.4912, weight: 3 },
    { name: "Lincoln Park, IL", zip: "60614", lat: 41.9214, lng: -87.6513, weight: 5 },
    { name: "Wicker Park, IL", zip: "60622", lat: 41.9088, lng: -87.6796, weight: 4 },
    { name: "Hyde Park, IL", zip: "60615", lat: 41.8023, lng: -87.5952, weight: 3 },
    { name: "The Loop, IL", zip: "60601", lat: 41.8827, lng: -87.6233, weight: 4 },
    { name: "Logan Square, IL", zip: "60647", lat: 41.9234, lng: -87.7058, weight: 3 },
    { name: "The Heights, TX", zip: "77008", lat: 29.7906, lng: -95.3983, weight: 5 },
    { name: "Montrose, TX", zip: "77006", lat: 29.7383, lng: -95.3903, weight: 4 },
    { name: "Midtown Houston, TX", zip: "77004", lat: 29.7378, lng: -95.3766, weight: 3 },
    { name: "Katy, TX", zip: "77449", lat: 29.7858, lng: -95.8585, weight: 3 },
    { name: "Sugar Land, TX", zip: "77479", lat: 29.5936, lng: -95.6349, weight: 2 },
    { name: "Brickell, FL", zip: "33131", lat: 25.7617, lng: -80.1918, weight: 5 },
    { name: "Miami Beach, FL", zip: "33139", lat: 25.7907, lng: -80.1300, weight: 4 },
    { name: "Coral Gables, FL", zip: "33134", lat: 25.7215, lng: -80.2684, weight: 3 },
    { name: "Fort Lauderdale, FL", zip: "33301", lat: 26.1224, lng: -80.1373, weight: 3 },
    { name: "Hialeah, FL", zip: "33012", lat: 25.8576, lng: -80.2781, weight: 2 },
    { name: "Buckhead, GA", zip: "30305", lat: 33.8403, lng: -84.3797, weight: 4 },
    { name: "Midtown Atlanta, GA", zip: "30308", lat: 33.7816, lng: -84.3827, weight: 4 },
    { name: "Decatur, GA", zip: "30030", lat: 33.7748, lng: -84.2963, weight: 3 },
    { name: "East Atlanta, GA", zip: "30316", lat: 33.7397, lng: -84.3437, weight: 2 },
    { name: "Uptown Dallas, TX", zip: "75201", lat: 32.7942, lng: -96.8025, weight: 5 },
    { name: "Deep Ellum, TX", zip: "75226", lat: 32.7822, lng: -96.7840, weight: 3 },
    { name: "Frisco, TX", zip: "75034", lat: 33.1507, lng: -96.8236, weight: 3 },
    { name: "Fort Worth, TX", zip: "76102", lat: 32.7555, lng: -97.3308, weight: 4 },
    { name: "Arlington, TX", zip: "76010", lat: 32.7357, lng: -97.1081, weight: 3 },
    { name: "Scottsdale, AZ", zip: "85251", lat: 33.4942, lng: -111.9261, weight: 4 },
    { name: "Tempe, AZ", zip: "85281", lat: 33.4255, lng: -111.9400, weight: 3 },
    { name: "Mesa, AZ", zip: "85201", lat: 33.4152, lng: -111.8315, weight: 3 },
    { name: "Phoenix, AZ", zip: "85004", lat: 33.4484, lng: -112.0740, weight: 4 },
    { name: "Capitol Hill, WA", zip: "98102", lat: 47.6205, lng: -122.3215, weight: 4 },
    { name: "Fremont, WA", zip: "98103", lat: 47.6510, lng: -122.3505, weight: 3 },
    { name: "Ballard, WA", zip: "98107", lat: 47.6677, lng: -122.3843, weight: 3 },
    { name: "Bellevue, WA", zip: "98004", lat: 47.6101, lng: -122.2015, weight: 3 },
    { name: "LoDo Denver, CO", zip: "80202", lat: 39.7533, lng: -104.9997, weight: 4 },
    { name: "Capitol Hill Denver, CO", zip: "80203", lat: 39.7312, lng: -104.9798, weight: 3 },
    { name: "Aurora, CO", zip: "80012", lat: 39.7294, lng: -104.8319, weight: 3 },
    { name: "Mission District, CA", zip: "94110", lat: 37.7599, lng: -122.4148, weight: 4 },
    { name: "SOMA, CA", zip: "94103", lat: 37.7726, lng: -122.4099, weight: 3 },
    { name: "Oakland, CA", zip: "94612", lat: 37.8044, lng: -122.2712, weight: 3 },
    { name: "San Jose, CA", zip: "95113", lat: 37.3382, lng: -121.8863, weight: 3 },
    { name: "East Nashville, TN", zip: "37206", lat: 36.1765, lng: -86.7496, weight: 4 },
    { name: "The Gulch, TN", zip: "37203", lat: 36.1510, lng: -86.7895, weight: 3 },
    { name: "Back Bay, MA", zip: "02116", lat: 42.3503, lng: -71.0810, weight: 4 },
    { name: "Cambridge, MA", zip: "02139", lat: 42.3736, lng: -71.1097, weight: 3 },
    { name: "South End, MA", zip: "02118", lat: 42.3424, lng: -71.0712, weight: 3 },
    { name: "East Austin, TX", zip: "78702", lat: 30.2620, lng: -97.7234, weight: 4 },
    { name: "South Congress, TX", zip: "78704", lat: 30.2468, lng: -97.7530, weight: 3 },
    { name: "Round Rock, TX", zip: "78664", lat: 30.5083, lng: -97.6789, weight: 2 },
    { name: "Alberta Arts, OR", zip: "97211", lat: 45.5590, lng: -122.6466, weight: 3 },
    { name: "Hawthorne, OR", zip: "97214", lat: 45.5119, lng: -122.6296, weight: 3 },
    { name: "Summerlin, NV", zip: "89134", lat: 36.1715, lng: -115.3324, weight: 3 },
    { name: "The Strip, NV", zip: "89109", lat: 36.1147, lng: -115.1728, weight: 4 },
    { name: "Henderson, NV", zip: "89014", lat: 36.0395, lng: -115.0590, weight: 3 },
    { name: "Uptown, MN", zip: "55408", lat: 44.9488, lng: -93.2983, weight: 3 },
    { name: "Northeast Minneapolis, MN", zip: "55413", lat: 44.9969, lng: -93.2536, weight: 2 },
    { name: "Corktown Detroit, MI", zip: "48216", lat: 42.3314, lng: -83.0654, weight: 3 },
    { name: "Royal Oak, MI", zip: "48067", lat: 42.4895, lng: -83.1446, weight: 2 },
    { name: "Garden District, LA", zip: "70130", lat: 29.9257, lng: -90.0849, weight: 3 },
    { name: "French Quarter, LA", zip: "70116", lat: 29.9584, lng: -90.0644, weight: 3 },
    { name: "Downtown Mobile, AL", zip: "36602", lat: 30.6954, lng: -88.0399, weight: 4 },
    { name: "Midtown Mobile, AL", zip: "36606", lat: 30.6834, lng: -88.0869, weight: 3 },
    { name: "Daphne, AL", zip: "36526", lat: 30.6035, lng: -87.9036, weight: 3 },
    { name: "Philadelphia, PA", zip: "19103", lat: 39.9526, lng: -75.1652, weight: 5 },
    { name: "San Diego, CA", zip: "92101", lat: 32.7157, lng: -117.1611, weight: 4 },
    { name: "San Antonio, TX", zip: "78205", lat: 29.4241, lng: -98.4936, weight: 4 },
    { name: "Jacksonville, FL", zip: "32202", lat: 30.3322, lng: -81.6557, weight: 3 },
    { name: "Columbus, OH", zip: "43215", lat: 39.9612, lng: -82.9988, weight: 3 },
    { name: "Indianapolis, IN", zip: "46204", lat: 39.7684, lng: -86.1581, weight: 3 },
    { name: "Charlotte, NC", zip: "28202", lat: 35.2271, lng: -80.8431, weight: 3 },
    { name: "Memphis, TN", zip: "38103", lat: 35.1495, lng: -90.0490, weight: 3 },
    { name: "Baltimore, MD", zip: "21202", lat: 39.2904, lng: -76.6122, weight: 3 },
    { name: "Milwaukee, WI", zip: "53202", lat: 43.0389, lng: -87.9065, weight: 3 },
    { name: "Oklahoma City, OK", zip: "73102", lat: 35.4676, lng: -97.5164, weight: 3 },
    { name: "Raleigh, NC", zip: "27601", lat: 35.7796, lng: -78.6382, weight: 3 },
    { name: "Tampa, FL", zip: "33602", lat: 27.9506, lng: -82.4572, weight: 3 },
    { name: "Pittsburgh, PA", zip: "15222", lat: 40.4406, lng: -79.9959, weight: 3 },
    { name: "Cincinnati, OH", zip: "45202", lat: 39.1031, lng: -84.5120, weight: 3 },
    { name: "Kansas City, MO", zip: "64106", lat: 39.0997, lng: -94.5786, weight: 3 },
    { name: "Salt Lake City, UT", zip: "84101", lat: 40.7608, lng: -111.8910, weight: 3 },
    { name: "Richmond, VA", zip: "23219", lat: 37.5407, lng: -77.4360, weight: 3 },
    { name: "St. Louis, MO", zip: "63102", lat: 38.6270, lng: -90.1994, weight: 3 },
    { name: "Honolulu, HI", zip: "96813", lat: 21.3069, lng: -157.8583, weight: 3 },
    { name: "Anchorage, AK", zip: "99501", lat: 61.2181, lng: -149.9003, weight: 2 },
  ];

  const ruralTowns: Loc[] = [
    { name: "Tupelo, MS", zip: "38801", lat: 34.2576, lng: -88.7034, weight: 2 },
    { name: "Broken Arrow, OK", zip: "74012", lat: 36.0609, lng: -95.7975, weight: 2 },
    { name: "Bowling Green, KY", zip: "42101", lat: 36.9685, lng: -86.4808, weight: 2 },
    { name: "Joplin, MO", zip: "64801", lat: 37.0842, lng: -94.5133, weight: 1 },
    { name: "Hattiesburg, MS", zip: "39401", lat: 31.3271, lng: -89.2903, weight: 2 },
    { name: "Fayetteville, AR", zip: "72701", lat: 36.0822, lng: -94.1719, weight: 2 },
    { name: "Dothan, AL", zip: "36301", lat: 31.2232, lng: -85.3905, weight: 2 },
    { name: "Florence, AL", zip: "35630", lat: 34.7998, lng: -87.6772, weight: 1 },
    { name: "Opelika, AL", zip: "36801", lat: 32.6454, lng: -85.3783, weight: 1 },
    { name: "Lake Charles, LA", zip: "70601", lat: 30.2132, lng: -93.2044, weight: 2 },
    { name: "Amarillo, TX", zip: "79101", lat: 35.2220, lng: -101.8313, weight: 2 },
    { name: "Lubbock, TX", zip: "79401", lat: 33.5779, lng: -101.8552, weight: 2 },
    { name: "Abilene, TX", zip: "79601", lat: 32.4487, lng: -99.7331, weight: 1 },
    { name: "Midland, TX", zip: "79701", lat: 31.9973, lng: -102.0779, weight: 2 },
    { name: "Tyler, TX", zip: "75701", lat: 32.3513, lng: -95.3011, weight: 1 },
    { name: "Waco, TX", zip: "76701", lat: 31.5493, lng: -97.1467, weight: 2 },
    { name: "Beaumont, TX", zip: "77701", lat: 30.0860, lng: -94.1019, weight: 1 },
    { name: "Bozeman, MT", zip: "59715", lat: 45.6770, lng: -111.0429, weight: 2 },
    { name: "Billings, MT", zip: "59101", lat: 45.7833, lng: -108.5007, weight: 1 },
    { name: "Rapid City, SD", zip: "57701", lat: 44.0805, lng: -103.2310, weight: 1 },
    { name: "Sioux Falls, SD", zip: "57104", lat: 43.5446, lng: -96.7311, weight: 2 },
    { name: "Fargo, ND", zip: "58102", lat: 46.8772, lng: -96.7898, weight: 2 },
    { name: "Bismarck, ND", zip: "58501", lat: 46.8083, lng: -100.7837, weight: 1 },
    { name: "Cheyenne, WY", zip: "82001", lat: 41.1400, lng: -104.8202, weight: 1 },
    { name: "Casper, WY", zip: "82601", lat: 42.8666, lng: -106.3131, weight: 1 },
    { name: "Flagstaff, AZ", zip: "86001", lat: 35.1983, lng: -111.6513, weight: 2 },
    { name: "Prescott, AZ", zip: "86301", lat: 34.5400, lng: -112.4685, weight: 1 },
    { name: "Bend, OR", zip: "97701", lat: 44.0582, lng: -121.3153, weight: 2 },
    { name: "Medford, OR", zip: "97501", lat: 42.3265, lng: -122.8756, weight: 1 },
    { name: "Spokane, WA", zip: "99201", lat: 47.6588, lng: -117.4260, weight: 2 },
    { name: "Yakima, WA", zip: "98901", lat: 46.6021, lng: -120.5059, weight: 1 },
    { name: "Boise, ID", zip: "83702", lat: 43.6150, lng: -116.2023, weight: 3 },
    { name: "Twin Falls, ID", zip: "83301", lat: 42.5558, lng: -114.4701, weight: 1 },
    { name: "Missoula, MT", zip: "59801", lat: 46.8721, lng: -114.0014, weight: 2 },
    { name: "Great Falls, MT", zip: "59401", lat: 47.5002, lng: -111.3008, weight: 1 },
    { name: "Reno, NV", zip: "89501", lat: 39.5296, lng: -119.8138, weight: 2 },
    { name: "Pensacola, FL", zip: "32501", lat: 30.4213, lng: -87.2169, weight: 2 },
    { name: "Panama City, FL", zip: "32401", lat: 30.1588, lng: -85.6602, weight: 1 },
    { name: "Tallahassee, FL", zip: "32301", lat: 30.4383, lng: -84.2807, weight: 2 },
    { name: "Savannah, GA", zip: "31401", lat: 32.0809, lng: -81.0912, weight: 2 },
    { name: "Macon, GA", zip: "31201", lat: 32.8407, lng: -83.6324, weight: 1 },
    { name: "Augusta, GA", zip: "30901", lat: 33.4735, lng: -81.9748, weight: 2 },
    { name: "Greenville, SC", zip: "29601", lat: 34.8526, lng: -82.3940, weight: 2 },
    { name: "Charleston, SC", zip: "29401", lat: 32.7765, lng: -79.9311, weight: 3 },
    { name: "Asheville, NC", zip: "28801", lat: 35.5951, lng: -82.5515, weight: 2 },
    { name: "Wilmington, NC", zip: "28401", lat: 34.2257, lng: -77.9447, weight: 2 },
    { name: "Knoxville, TN", zip: "37902", lat: 35.9606, lng: -83.9207, weight: 2 },
    { name: "Chattanooga, TN", zip: "37402", lat: 35.0456, lng: -85.3097, weight: 2 },
    { name: "Lexington, KY", zip: "40507", lat: 38.0406, lng: -84.5037, weight: 2 },
    { name: "Louisville, KY", zip: "40202", lat: 38.2527, lng: -85.7585, weight: 3 },
    { name: "Huntsville, AL", zip: "35801", lat: 34.7304, lng: -86.5861, weight: 2 },
    { name: "Montgomery, AL", zip: "36104", lat: 32.3792, lng: -86.3077, weight: 2 },
    { name: "Birmingham, AL", zip: "35203", lat: 33.5207, lng: -86.8025, weight: 3 },
    { name: "Biloxi, MS", zip: "39530", lat: 30.3960, lng: -88.8853, weight: 2 },
    { name: "Jackson, MS", zip: "39201", lat: 32.2988, lng: -90.1848, weight: 2 },
    { name: "Shreveport, LA", zip: "71101", lat: 32.5252, lng: -93.7502, weight: 2 },
    { name: "Baton Rouge, LA", zip: "70801", lat: 30.4515, lng: -91.1871, weight: 3 },
    { name: "Lafayette, LA", zip: "70501", lat: 30.2241, lng: -92.0198, weight: 2 },
    { name: "Little Rock, AR", zip: "72201", lat: 34.7465, lng: -92.2896, weight: 2 },
    { name: "Springfield, MO", zip: "65806", lat: 37.2090, lng: -93.2923, weight: 2 },
    { name: "Des Moines, IA", zip: "50309", lat: 41.5868, lng: -93.6250, weight: 2 },
    { name: "Cedar Rapids, IA", zip: "52401", lat: 41.9779, lng: -91.6656, weight: 1 },
    { name: "Omaha, NE", zip: "68102", lat: 41.2565, lng: -95.9345, weight: 2 },
    { name: "Lincoln, NE", zip: "68508", lat: 40.8258, lng: -96.6852, weight: 2 },
    { name: "Wichita, KS", zip: "67202", lat: 37.6872, lng: -97.3301, weight: 2 },
    { name: "Topeka, KS", zip: "66603", lat: 39.0473, lng: -95.6752, weight: 1 },
    { name: "Burlington, VT", zip: "05401", lat: 44.4759, lng: -73.2121, weight: 2 },
    { name: "Portland, ME", zip: "04101", lat: 43.6591, lng: -70.2568, weight: 2 },
    { name: "Manchester, NH", zip: "03101", lat: 42.9956, lng: -71.4548, weight: 1 },
    { name: "Providence, RI", zip: "02903", lat: 41.8240, lng: -71.4128, weight: 2 },
    { name: "Hartford, CT", zip: "06103", lat: 41.7658, lng: -72.6734, weight: 2 },
    { name: "Albuquerque, NM", zip: "87102", lat: 35.0844, lng: -106.6504, weight: 3 },
    { name: "Santa Fe, NM", zip: "87501", lat: 35.6870, lng: -105.9378, weight: 2 },
    { name: "El Paso, TX", zip: "79901", lat: 31.7619, lng: -106.4850, weight: 2 },
    { name: "Corpus Christi, TX", zip: "78401", lat: 27.8006, lng: -97.3964, weight: 2 },
    { name: "McAllen, TX", zip: "78501", lat: 26.2034, lng: -98.2300, weight: 1 },
    { name: "Laredo, TX", zip: "78040", lat: 27.5036, lng: -99.5076, weight: 1 },
    { name: "Wilmington, DE", zip: "19801", lat: 39.7391, lng: -75.5398, weight: 2 },
    { name: "Dover, DE", zip: "19901", lat: 39.1582, lng: -75.5244, weight: 1 },
    { name: "Newark, NJ", zip: "07102", lat: 40.7357, lng: -74.1724, weight: 3 },
    { name: "Jersey City, NJ", zip: "07302", lat: 40.7178, lng: -74.0431, weight: 3 },
    { name: "Hoboken, NJ", zip: "07030", lat: 40.7440, lng: -74.0324, weight: 2 },
    { name: "Princeton, NJ", zip: "08540", lat: 40.3573, lng: -74.6672, weight: 2 },
    { name: "Charleston, WV", zip: "25301", lat: 38.3498, lng: -81.6326, weight: 2 },
    { name: "Huntington, WV", zip: "25701", lat: 38.4192, lng: -82.4452, weight: 1 },
    { name: "Morgantown, WV", zip: "26505", lat: 39.6295, lng: -79.9559, weight: 2 },
    { name: "Washington, DC", zip: "20001", lat: 38.9072, lng: -77.0369, weight: 5 },
    { name: "Georgetown, DC", zip: "20007", lat: 38.9076, lng: -77.0723, weight: 3 },
    { name: "Capitol Hill, DC", zip: "20003", lat: 38.8867, lng: -76.9960, weight: 3 },
    { name: "Madison, WI", zip: "53703", lat: 43.0731, lng: -89.4012, weight: 3 },
    { name: "Green Bay, WI", zip: "54301", lat: 44.5133, lng: -88.0133, weight: 2 },
    { name: "Fairbanks, AK", zip: "99701", lat: 64.8378, lng: -147.7164, weight: 2 },
    { name: "Juneau, AK", zip: "99801", lat: 58.3005, lng: -134.4197, weight: 1 },
    { name: "Sitka, AK", zip: "99835", lat: 57.0531, lng: -135.3300, weight: 1 },
    { name: "Maui, HI", zip: "96768", lat: 20.7984, lng: -156.3319, weight: 2 },
    { name: "Hilo, HI", zip: "96720", lat: 19.7071, lng: -155.0885, weight: 1 },
    { name: "Kailua, HI", zip: "96734", lat: 21.4022, lng: -157.7394, weight: 2 },
  ];

  const allLocations = [...majorCities, ...ruralTowns];

  const generalLabor = [
    "Moving Help — Apartment to Storage", "Yard Cleanup & Leaf Removal", "Garage Cleanout & Organize",
    "Trash Haul — Full Truck Load", "Furniture Rearrangement — Living Room", "Deep Cleaning — 2BR Apartment",
    "Packing & Boxing for Move", "Pressure Washing — Driveway", "Carpet Shampooing — 3 Rooms",
    "Post-Construction Cleanup", "Warehouse Organizing — 4 Hours", "Painting — Interior Bedroom",
    "Loading/Unloading Moving Truck", "Fence Removal — Old Chain Link", "Window Washing — 2-Story House",
    "Airbnb Turnover Cleaning", "Office Cleanout — 800 sq ft", "Gutter Cleaning — Single Story",
    "Storage Unit Organization", "Landscaping — Mulch Spreading", "Snow Removal — Driveway & Walk",
    "Roof Debris Cleanup After Storm", "Junk Removal — Basement Cleanout", "Deck Sanding & Staining Prep",
  ];

  const skilledLabor = [
    "Plumbing Repair — Leaking Pipe", "Electrical Outlet Install — 3 Outlets", "Drywall Patch & Paint",
    "Tile Repair — Bathroom Floor", "Cabinet Hinge Replacement", "Door Frame Repair — Warped Entry",
    "Ceiling Fan Install", "Fence Post Repair — 4 Posts", "Deck Board Replacement",
    "AC Maintenance — Pre-Season Check", "Water Heater Flush & Inspect", "Smoke Detector Wiring — 4 Units",
    "Garage Door Spring Replacement", "Sprinkler Head Repair — 6 Zones", "Toilet Replace & Install",
    "Bathroom Re-caulk — Tub & Shower", "Gutter Guard Install", "Smart Thermostat Install",
    "Light Fixture Swap — 5 Fixtures", "Garbage Disposal Install", "Dishwasher Install",
    "Auto Detailing — Full Interior/Exterior", "Small Engine Repair — Lawnmower", "Welding — Gate Hinge Repair",
  ];

  const onDemand = [
    "Grocery Delivery — 6 Bags", "Pharmacy Pickup & Delivery", "Package Drop-Off — 3 Locations",
    "Airport Ride — Early Morning", "Furniture Delivery — Store to Home", "Document Notary Run",
    "Pet Sitting — Weekend (2 Days)", "Dog Walking — Daily (5 Days)", "Dry Cleaning Pickup & Delivery",
    "Food Delivery — Catering Order", "Car Wash — Mobile Detailing", "Flower Delivery — Same Day",
    "Assembly Help — IKEA Furniture", "Key Copy & Lockout Help", "Appliance Haul — Old Washer",
    "Costume Delivery for Event", "Gift Wrapping — 20 Items", "Event Supplies Pickup",
  ];

  const verifyInspect = [
    "Pre-Purchase Vehicle Inspection — Sedan", "Pre-Purchase Vehicle Inspection — Truck",
    "Pre-Purchase Vehicle Inspection — SUV", "Used Car Check — Craigslist Seller",
    "Dealer Auction Inspection — Check Vehicle Before Bidding", "Dealer Pre-Bid Walk — 3 Cars at Auction",
    "Salvage Yard Parts Check — Transmission", "Salvage Yard Parts Check — Engine Block",
    "Used Auto Parts Verification — Alternator & Starter", "Junkyard Component Inspect — Doors & Fenders",
    "Property Walkthrough — Rental Unit", "Pre-Lease Apartment Inspection",
    "Home Inspection — Before Making Offer", "Condo Inspection — Pre-Purchase",
    "Rental Move-Out Documentation", "Roof Condition Photo Report",
    "Foundation Crack Inspection & Photos", "Boat Inspection — Pre-Purchase",
    "RV Inspection — Pre-Purchase", "Motorcycle Inspection — Craigslist",
    "Equipment Inspection — Used Forklift", "Fleet Vehicle Check — 3 Vans",
    "Fire Extinguisher Inspection — Commercial", "ATV/UTV Pre-Purchase Check",
    "Looking for Car — Need Someone to Scout Lots", "Find Me a Truck Under $15K — Lot Scout",
    "Auction Proxy — Bid & Inspect at Dealer Auction", "Estate Sale Scout — Check Items Before Bidding",
  ];

  const marketplace = [
    "Selling: Used Honda Civic Parts — Doors, Hood, Bumper",
    "Selling: Toyota Camry Transmission — Low Miles — $800",
    "Selling: F-150 Tailgate — 2018 Model — $350",
    "Selling: Set of 4 Michelin Tires — 225/65R17 — $280",
    "Selling: Chevy Silverado Headlights — OEM — $150",
    "Selling: Jeep Wrangler Soft Top — $400",
    "Selling: BMW 3-Series Wheels — 18\" — $600",
    "Selling: Power Tools Lot — Dewalt Drill, Saw, Sander — $450",
    "Selling: Riding Lawn Mower — John Deere — $1,200",
    "Selling: Commercial Pressure Washer — $550",
    "Selling: Restaurant Equipment — Flat Top Grill — $900",
    "Selling: 65\" Samsung Smart TV — $375",
    "Selling: Gaming PC Build — RTX 4070 — $750",
    "Selling: Vintage Record Player — Technics — $220",
    "Selling: Electric Scooter — $180",
    "Selling: Mountain Bike — Trek — $400",
    "Selling: Standing Desk — Uplift — $300",
    "Selling: Baby Crib & Changing Table Set — $250",
    "Selling: Kayak — 12ft Sit-In — $350",
    "Selling: Drum Kit — Pearl Export — $500",
    "Selling: Welder — Lincoln MIG 180 — $650",
    "Selling: ATV Parts — Polaris Sportsman — Various",
    "Selling: Boat Motor — 40HP Mercury Outboard — $1,100",
    "Selling: Salvage Ford Mustang — Runs, Needs Body Work — $3,500",
  ];

  const barterLabor = [
    { title: "Trade: Haircuts for Lawn Mowing", off: "3 professional haircuts", need: "Monthly lawn mowing (2 months)" },
    { title: "Trade: Guitar Lessons for House Painting", off: "8 guitar lessons (1 hr each)", need: "Interior painting — 2 rooms" },
    { title: "Trade: Photography for Web Design", off: "Portrait photo session (2 hrs)", need: "WordPress site build" },
    { title: "Trade: Tutoring for Car Repair", off: "Math tutoring — 10 sessions", need: "Brake pad replacement" },
    { title: "Trade: Baking for Plumbing Help", off: "Custom cakes (3 orders)", need: "Fix kitchen sink drain" },
    { title: "Trade: Dog Training for Fence Build", off: "6-week dog training course", need: "50ft fence section install" },
    { title: "Trade: Graphic Design for Moving Help", off: "Logo + business card design", need: "Help moving — 4 hours" },
    { title: "Trade: Spanish Lessons for Yard Work", off: "Spanish tutoring (8 hrs)", need: "Full yard cleanup" },
    { title: "Trade: Meal Prep for Furniture Assembly", off: "1 week of meal prep (5 meals)", need: "IKEA furniture assembly — 3 items" },
    { title: "Trade: Massage Therapy for Painting", off: "2 massage sessions (1 hr each)", need: "Exterior fence staining" },
  ];

  const workers = [
    "Available for General Labor", "Available for Moving Help", "Available for Delivery Runs",
    "Available for Cleaning Services", "Available for Handyman Work", "Available for Yard Work",
    "Available for Pet Sitting", "Available for Event Setup", "Available for Warehouse Work",
    "Available for Painting", "Available for Auto Detailing", "Available for Property Inspections",
  ];

  function seededRandom(seed: number) {
    let s = seed;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  const rng = seededRandom(42);
  const pick = <T>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
  const budgetRange = (min: number, max: number) => Math.round(min + rng() * (max - min));

  const allJobs: any[] = [];

  for (const loc of allLocations) {
    const jobCount = loc.weight * 3 + Math.floor(rng() * loc.weight * 4);

    for (let i = 0; i < jobCount; i++) {
      const jitter = () => (rng() - 0.5) * 0.02;
      const lat = loc.lat + jitter();
      const lng = loc.lng + jitter();
      const poster = rng() > 0.5 ? cId : bId;
      const roll = rng();

      if (roll < 0.28) {
        const t = pick(generalLabor);
        allJobs.push({ title: `${t} — ${loc.name}`, desc: `${t}. Posted on GUBER.`, cat: "General Labor", budget: budgetRange(35, 250), loc: loc.name, zip: loc.zip, lat, lng, poster, payType: "fixed" });
      } else if (roll < 0.50) {
        const t = pick(skilledLabor);
        allJobs.push({ title: `${t} — ${loc.name}`, desc: `${t}. Experienced help needed.`, cat: "Skilled Labor", budget: budgetRange(50, 350), loc: loc.name, zip: loc.zip, lat, lng, poster, payType: "fixed" });
      } else if (roll < 0.68) {
        const t = pick(onDemand);
        allJobs.push({ title: `${t} — ${loc.name}`, desc: `${t}. Quick turnaround needed.`, cat: "On-Demand Help", budget: budgetRange(20, 150), loc: loc.name, zip: loc.zip, lat, lng, poster, payType: "fixed" });
      } else if (roll < 0.88) {
        const t = pick(verifyInspect);
        allJobs.push({ title: `${t} — ${loc.name}`, desc: `${t}. Detailed report required.`, cat: "Verify & Inspect", budget: budgetRange(45, 200), loc: loc.name, zip: loc.zip, lat, lng, poster, payType: "fixed" });
      } else {
        const b = pick(barterLabor);
        allJobs.push({ title: `${b.title} — ${loc.name}`, desc: `Barter exchange in ${loc.name}.`, cat: "Barter Labor", budget: 0, loc: loc.name, zip: loc.zip, lat, lng, poster, payType: "barter", barterOff: b.off, barterNeed: b.need });
      }
    }
  }

  console.log(`[GUBER] Seeding ${allJobs.length} nationwide demo jobs...`);

  const BATCH_SIZE = 50;
  for (let i = 0; i < allJobs.length; i += BATCH_SIZE) {
    const batch = allJobs.slice(i, i + BATCH_SIZE);
    const values = batch.map(j => ({
      title: j.title,
      description: j.desc,
      category: j.cat,
      budget: j.budget,
      location: j.loc,
      locationApprox: j.loc,
      zip: j.zip,
      lat: j.lat,
      lng: j.lng,
      status: "posted_public" as const,
      postedById: j.poster,
      isPublished: true,
      isPaid: false,
      payType: j.payType,
      ...(j.barterOff ? { barterOffering: j.barterOff, barterNeed: j.barterNeed } : {}),
    }));
    await db.insert(jobs).values(values);
  }

  console.log(`[GUBER] ${allJobs.length} nationwide demo jobs seeded.`);
}

async function seedNationwideCashDrops() {
  const marker = await db.execute(sql`SELECT id FROM cash_drops WHERE sponsor_name = 'DEMO_GUBER' LIMIT 1`);
  if (marker.rows.length) return;

  const now = new Date();
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);

  const drops = [
    { title: "Times Square Treasure Hunt", desc: "Find the golden GUBER pin hidden near the Red Steps!", reward: 50, lat: 40.7580, lng: -73.9855, city: "New York", clue: "Where the world watches the ball drop — look for the red glow." },
    { title: "Hollywood Walk of Fame Drop", desc: "Walk the stars and claim your cash!", reward: 35, lat: 34.1016, lng: -118.3268, city: "Los Angeles", clue: "Between the handprints and the stars — find the golden sidewalk square." },
    { title: "Millennium Park Cash Drop", desc: "The Bean reflects more than just your face today!", reward: 40, lat: 41.8827, lng: -87.6233, city: "Chicago", clue: "Stand where the skyline curves — your reflection holds the key." },
    { title: "Space Needle District Drop", desc: "Look up for the needle, look down for the cash!", reward: 30, lat: 47.6205, lng: -122.3493, city: "Seattle", clue: "In the shadow of the tallest point — check the fountain circle." },
    { title: "South Beach Sunrise Drop", desc: "Early bird gets the cash on Ocean Drive!", reward: 45, lat: 25.7825, lng: -80.1340, city: "Miami", clue: "Where the art deco meets the sand — sunrise side, pastel building." },
    { title: "French Quarter Find", desc: "Jazz, beads, and GUBER cash — only in NOLA!", reward: 25, lat: 29.9584, lng: -90.0644, city: "New Orleans", clue: "Where the music never stops — find the iron balcony with the green shutters." },
    { title: "Riverwalk Rush — San Antonio", desc: "Stroll the river, grab the reward!", reward: 30, lat: 29.4241, lng: -98.4936, city: "San Antonio", clue: "Follow the water past the stone bridge — the third bench holds a secret." },
    { title: "Gateway Arch Cash Drop", desc: "Meet us at the monument that marks the West!", reward: 35, lat: 38.6247, lng: -90.1848, city: "St. Louis", clue: "Under the tallest arch — the east-facing fountain knows." },
    { title: "Pike Place Discovery", desc: "Fish, flowers, and free money at Pike Place!", reward: 40, lat: 47.6097, lng: -122.3422, city: "Seattle", clue: "Where they throw the fish — the brass pig knows the spot." },
    { title: "Piedmont Park Pickup — Atlanta", desc: "Green space, good vibes, and GUBER cash!", reward: 30, lat: 33.7879, lng: -84.3737, city: "Atlanta", clue: "The meadow where the skyline watches — near the lake pavilion." },
    { title: "6th Street Sprint — Austin", desc: "Live music and live cash drops!", reward: 35, lat: 30.2672, lng: -97.7431, city: "Austin", clue: "Between the neon signs and the taco trucks — look for the mural." },
    { title: "Navy Pier Bounty — Chicago", desc: "Ferris wheel views and free money!", reward: 50, lat: 41.8917, lng: -87.6086, city: "Chicago", clue: "Where the lake meets the pier — the east end bench." },
    { title: "Fremont Street Flash — Vegas", desc: "Old Vegas, new cash!", reward: 40, lat: 36.1699, lng: -115.1398, city: "Las Vegas", clue: "Under the canopy of lights — where the cowboy waves." },
    { title: "Mobile Bay Treasure", desc: "Gulf Coast cash waiting for you!", reward: 25, lat: 30.6954, lng: -88.0399, city: "Mobile, AL", clue: "Where the azaleas bloom by the bay — the old fort entrance." },
    { title: "Golden Gate Park Drop", desc: "Fog, trees, and GUBER treasures!", reward: 45, lat: 37.7694, lng: -122.4862, city: "San Francisco", clue: "Near the bison paddock — the wooden bench facing west." },
    { title: "Boston Common Claim", desc: "America's oldest park, newest cash drop!", reward: 35, lat: 42.3554, lng: -71.0656, city: "Boston", clue: "By the frog pond — the bench with the bronze plaque." },
  ];

  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    await db.insert(cashDrops).values({
      title: d.title, description: d.desc,
      rewardPerWinner: d.reward, winnerLimit: 10, winnersFound: 0, cashWinnerCount: 0,
      status: "active",
      startTime: hoursFromNow(-2 + i),
      endTime: hoursFromNow(22 + i * 2),
      gpsLat: d.lat, gpsLng: d.lng, gpsRadius: 300,
      clueText: d.clue,
      rewardType: "cash", fundingSource: "guber_cash_app",
      sponsorName: "DEMO_GUBER", isSponsored: false,
    });
  }
}

async function seedDemoReviewsAndWallet() {
  const consumer = await storage.getUserByEmail(DEMO_CONSUMER_EMAIL);
  const business = await storage.getUserByEmail(DEMO_BUSINESS_EMAIL);
  if (!consumer || !business) return;

  const existingReviews = await db.execute(sql`SELECT id FROM reviews WHERE reviewer_id = ${business.id} AND reviewee_id = ${consumer.id} LIMIT 1`);
  if (!existingReviews.rows.length) {
    const consumerJobs = await db.execute(sql`SELECT id FROM jobs WHERE assigned_helper_id = ${consumer.id} AND status = 'completed' ORDER BY completed_at DESC LIMIT 30`);
    const bizJobs = consumerJobs.rows as { id: number }[];

    const bizReviewsOfAlex = [
      { rating: 5.0, comment: "Alex showed up early and did an incredible job. Apartment was spotless. Will definitely hire again.", tags: ["on_time", "thorough", "professional"] },
      { rating: 5.0, comment: "Delivered all supplies on time and in perfect condition. Great communication throughout.", tags: ["reliable", "good_communication"] },
      { rating: 4.8, comment: "Solid fence repair work. Very detail-oriented and cleaned up after himself.", tags: ["skilled", "clean"] },
      { rating: 5.0, comment: "Photo report was extremely detailed. Caught things I would've missed. Top-tier worker.", tags: ["thorough", "professional", "detail_oriented"] },
      { rating: 5.0, comment: "Drywall repair looks factory-fresh. This guy knows his stuff.", tags: ["skilled", "quality_work"] },
      { rating: 4.9, comment: "Common areas look brand new. Tenants already noticed the difference.", tags: ["thorough", "impact"] },
      { rating: 5.0, comment: "Handled 3 deliveries efficiently in one run. Saved us time and money.", tags: ["efficient", "reliable"] },
      { rating: 5.0, comment: "Best property inspection report I've ever received. 47 photos with detailed notes.", tags: ["thorough", "detail_oriented", "professional"] },
      { rating: 4.8, comment: "Re-caulking was clean and professional. All 3 units done in under 4 hours.", tags: ["fast", "skilled"] },
      { rating: 5.0, comment: "Cleared out the lot completely. Even swept the sidewalk without being asked.", tags: ["goes_above_and_beyond", "clean"] },
      { rating: 5.0, comment: "Appliances installed perfectly. Even tested everything before leaving.", tags: ["skilled", "thorough"] },
      { rating: 4.9, comment: "Thorough fleet van inspection. Caught a brake issue we didn't know about.", tags: ["detail_oriented", "professional"] },
      { rating: 5.0, comment: "Garage is completely organized now. Great categorization system.", tags: ["organized", "thorough"] },
      { rating: 5.0, comment: "Fixed all 3 faucets. No more dripping. Very clean work.", tags: ["skilled", "clean"] },
      { rating: 4.8, comment: "Parking lot looks great. Line touch-ups are crisp and even.", tags: ["quality_work", "detail_oriented"] },
      { rating: 5.0, comment: "Gutters are spotless. Even flushed the downspouts. Highly recommend.", tags: ["thorough", "goes_above_and_beyond"] },
      { rating: 5.0, comment: "All detectors installed and tested. Documentation provided. Perfect.", tags: ["professional", "organized"] },
      { rating: 4.9, comment: "Model unit looks amazing. All furniture assembled correctly and staged nicely.", tags: ["skilled", "detail_oriented"] },
      { rating: 5.0, comment: "Comprehensive pre-lease inspection. Saved us from a costly mistake.", tags: ["thorough", "professional", "valuable"] },
      { rating: 5.0, comment: "Both properties look immaculate. Alex is our go-to for yard work.", tags: ["reliable", "quality_work"] },
    ];

    for (let i = 0; i < Math.min(bizReviewsOfAlex.length, bizJobs.length); i++) {
      const r = bizReviewsOfAlex[i];
      await db.insert(reviews).values({ jobId: bizJobs[i].id, reviewerId: business.id, revieweeId: consumer.id, rating: r.rating, comment: r.comment, tags: r.tags });
    }

    const alexReviewsOfMarcus = [
      { rating: 5.0, comment: "Great client. Clear instructions, pays on time, and always respectful.", tags: ["clear_instructions", "prompt_payment"] },
      { rating: 5.0, comment: "Marcus is one of the best clients on GUBER. Always has everything ready.", tags: ["organized", "respectful"] },
      { rating: 4.9, comment: "Fair pricing and great communication. Happy to work with Thompson Property anytime.", tags: ["fair", "good_communication"] },
      { rating: 5.0, comment: "Provided all supplies as promised. Job was straightforward and well-described.", tags: ["honest", "prepared"] },
      { rating: 5.0, comment: "Pays fast, communicates well, and always professional. 5 stars.", tags: ["prompt_payment", "professional"] },
    ];

    for (let i = 0; i < Math.min(alexReviewsOfMarcus.length, bizJobs.length); i++) {
      const r = alexReviewsOfMarcus[i];
      await db.insert(reviews).values({ jobId: bizJobs[i].id, reviewerId: consumer.id, revieweeId: business.id, rating: r.rating, comment: r.comment, tags: r.tags });
    }
  }

  const existingWallet = await db.execute(sql`SELECT id FROM wallet_transactions WHERE user_id = ${consumer.id} AND description LIKE '%Demo%' LIMIT 1`);
  if (!existingWallet.rows.length) {
    const earnings = [
      { amount: 200, desc: "Demo — Emergency Pipe Repair payout", date: "2025-11-15" },
      { amount: 180, desc: "Demo — Carpet Cleaning — 5 Units payout", date: "2025-11-10" },
      { amount: 160, desc: "Demo — Holiday Light Install payout", date: "2025-11-28" },
      { amount: 140, desc: "Demo — Pressure Washing payout", date: "2025-11-20" },
      { amount: 144, desc: "Demo — Drywall Patch payout", date: "2026-02-10" },
      { amount: 128, desc: "Demo — Window Cleaning payout", date: "2025-12-05" },
      { amount: 120, desc: "Demo — Fence Post Repair payout", date: "2026-02-20" },
      { amount: 112, desc: "Demo — Roof Gutter Cleaning payout", date: "2025-12-28" },
      { amount: 104, desc: "Demo — Bathroom Re-caulk payout", date: "2026-01-20" },
      { amount: 96, desc: "Demo — Appliance Delivery payout", date: "2026-01-15" },
      { amount: 88, desc: "Demo — Plumbing Check payout", date: "2026-01-05" },
      { amount: 88, desc: "Demo — Deep Clean payout", date: "2026-02-05" },
      { amount: 80, desc: "Demo — Garage Cleanout payout", date: "2026-01-08" },
      { amount: 76, desc: "Demo — Apartment Cleaning payout", date: "2026-02-28" },
      { amount: 76, desc: "Demo — Salvage Evaluation payout", date: "2025-11-25" },
      { amount: 76, desc: "Demo — Yard Maintenance payout", date: "2025-12-10" },
      { amount: 72, desc: "Demo — Smoke Detector Install payout", date: "2025-12-22" },
      { amount: 72, desc: "Demo — Property Photo Report payout", date: "2026-01-25" },
      { amount: 68, desc: "Demo — Tenant Walkthrough payout", date: "2026-02-15" },
      { amount: 68, desc: "Demo — Pre-Lease Inspection payout", date: "2025-12-15" },
      { amount: 64, desc: "Demo — Furniture Assembly payout", date: "2025-12-18" },
      { amount: 64, desc: "Demo — End-of-Lease Photos payout", date: "2025-10-28" },
      { amount: 60, desc: "Demo — Parking Lot Sweep payout", date: "2026-01-03" },
      { amount: 60, desc: "Demo — Cabinet Hardware payout", date: "2025-12-01" },
      { amount: 60, desc: "Demo — Trash Haul payout", date: "2026-01-18" },
      { amount: 56, desc: "Demo — Fire Extinguisher payout", date: "2025-11-05" },
      { amount: 52, desc: "Demo — Delivery Supplies payout", date: "2026-03-12" },
      { amount: 52, desc: "Demo — Vehicle Inspection payout", date: "2026-01-12" },
      { amount: 48, desc: "Demo — Mailbox Repair payout", date: "2025-11-01" },
      { amount: 44, desc: "Demo — Package Delivery payout", date: "2026-01-30" },
      { amount: 60, desc: "Demo — Moving Boxes payout", date: "2026-03-10" },
      { amount: 36, desc: "Demo — Quick Delivery payout", date: "2026-03-18" },
      { amount: 44, desc: "Demo — Vehicle Inspection payout", date: "2026-03-05" },
      { amount: 25, desc: "Demo — Cash Drop reward", date: "2026-03-20" },
    ];

    for (const e of earnings) {
      await db.insert(walletTransactions).values({
        userId: consumer.id, type: "earning", amount: e.amount, status: "completed",
        description: e.desc, stripeTransferId: `demo_txfr_${e.date.replace(/-/g, "")}`,
      });
    }
  }
}
