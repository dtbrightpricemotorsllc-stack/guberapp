import { storage } from "./storage";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import { viCategories, useCases, catalogServiceTypes, detailOptionSets, proofTemplates, proofChecklistItems, categories, serviceTypes, ogPreapprovedEmails, users, servicePricingConfig, platformSettings } from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";

// Master list of Day-1 OG preapproved emails.
// Safe to add new entries — INSERT ON CONFLICT DO NOTHING means it never double-inserts.
// On every server boot this syncs both databases (dev + production) automatically.
const OG_PREAPPROVED_EMAILS = [
  "guberapp.global@gmail.com",
  "gavo6official@gmail.com",
  "prestigioustowingllc@gmail.com",
  "lifeisimprovin@gmail.com",
  "flowsonxbox@yahoo.com",
  "fly10guy@gmail.com",
  "kristopherhadley@ymail.com",
  "calisehayes1984@gmail.com",
  "trevorbohannon94@gmail.com",
  "masonjvogroup@gmail.com",
  "semajanderson1987@icloud.com",
  "julianlightbody@gmail.com",
  "mylesbutler@ymail.com",
  "visionaryautoglass@gmail.com",
  "robertboulosqa@gmail.com",
  "mgersak20@gmail.com",
  "ceibutler@gmail.com",
  "chikinluvinmama@gmail.com",
];

export async function syncOGPreapprovedEmails() {
  try {
    // 1. Upsert the master list into the preapproved table (safe to run repeatedly)
    if (OG_PREAPPROVED_EMAILS.length > 0) {
      await db
        .insert(ogPreapprovedEmails)
        .values(OG_PREAPPROVED_EMAILS.map((email) => ({ email: email.toLowerCase() })))
        .onConflictDoNothing();
    }

    // 2. Retroactively grant day1_og=true + aiOrNotCredits to any already-registered users on the list
    const lowerEmails = OG_PREAPPROVED_EMAILS.map((e) => e.toLowerCase());
    await db
      .update(users)
      .set({ day1OG: true })
      .where(inArray(users.email, lowerEmails));

    // 3. Grant 5 AI credits to any OG user who doesn't have them yet
    //    (unlimited text is Trust Toolbox-only — OG only gets the 5 guess-detail credits)
    await db.execute(sql`
      UPDATE users
      SET ai_or_not_credits = 5
      WHERE day1_og = TRUE
        AND (ai_or_not_credits IS NULL OR ai_or_not_credits < 5)
        AND trust_box_purchased = FALSE
    `);

    console.log("[GUBER] OG preapproved emails synced and retroactive OG grants applied.");
  } catch (e) {
    console.error("[GUBER] syncOGPreapprovedEmails error:", e);
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function seedCatalog() {
  const existingCats = await storage.getVICategories();
  if (existingCats.length > 0) {
    console.log("Catalog already seeded. Skipping catalog.");
    return;
  }

  const cat1 = await storage.createVICategory({ name: "Property & Site Check", description: "Property inspections, documentation, move-in/out checks", icon: "building", sortOrder: 1 });
  const cat2 = await storage.createVICategory({ name: "Wheels, Wings & Water", description: "Vehicle, boat, motorcycle visual verification", icon: "car", sortOrder: 2 });
  const cat3 = await storage.createVICategory({ name: "Online Items", description: "Marketplace item verification, electronics power-on proof", icon: "package", sortOrder: 3 });
  const cat4 = await storage.createVICategory({ name: "Quick Check", description: "Quick presence confirmation, visual checks, fast proof", icon: "eye", sortOrder: 4 });

  // Skilled Labor service types with tiers
  const skilledCat = await db.select().from(categories).where(eq(categories.name, "Skilled Labor"));
  let skilledCatId = skilledCat[0]?.id;
  if (!skilledCatId) {
    const [newCat] = await db.insert(categories).values({ name: "Skilled Labor", icon: "wrench", color: "orange" }).returning();
    skilledCatId = newCat.id;
  }

  const skilledServices = [
    { name: "Plumbing", minTier: "verified", requiresCredential: true },
    { name: "Electrical", minTier: "credentialed", requiresCredential: true },
    { name: "HVAC", minTier: "credentialed", requiresCredential: true },
    { name: "Carpentry", minTier: "verified", requiresCredential: false },
    { name: "Drywall", minTier: "community", requiresCredential: false },
    { name: "Painting", minTier: "community", requiresCredential: false },
    { name: "Welding", minTier: "credentialed", requiresCredential: true },
    { name: "Auto Repair", minTier: "verified", requiresCredential: true },
    { name: "Roofing", minTier: "verified", requiresCredential: true },
    { name: "Flooring", minTier: "community", requiresCredential: false },
  ];

  for (const s of skilledServices) {
    await db.insert(serviceTypes).values({
      name: s.name,
      categoryId: skilledCatId,
      category: "Skilled Labor",
      minTier: s.minTier,
      requiresCredential: s.requiresCredential
    });
  }

  const ptProperty = await storage.createProofTemplate({ name: "Property Standard", requiredPhotoCount: 10, requiredVideo: false, geoRequired: true, minDistanceRadius: 500, allowGalleryUpload: false, notEncounteredReasons: ["No access", "Address incorrect", "Unsafe conditions", "Tenant refused entry", "Property demolished/vacant", "Other"] });
  const ptPropertyFull = await storage.createProofTemplate({ name: "Property Full Package", requiredPhotoCount: 25, requiredVideo: true, videoDuration: "2min", geoRequired: true, minDistanceRadius: 500, allowGalleryUpload: false, notEncounteredReasons: ["No access", "Address incorrect", "Unsafe conditions", "Tenant refused entry", "Other"] });
  const ptVehicleBasic = await storage.createProofTemplate({ name: "Vehicle Basic", requiredPhotoCount: 10, requiredVideo: false, geoRequired: true, minDistanceRadius: 1000, allowGalleryUpload: false, notEncounteredReasons: ["Vehicle not found", "Lot closed", "Seller not present", "Address incorrect", "Unsafe", "Other"] });
  const ptVehicleStandard = await storage.createProofTemplate({ name: "Vehicle Standard", requiredPhotoCount: 25, requiredVideo: true, videoDuration: "30s", geoRequired: true, minDistanceRadius: 1000, allowGalleryUpload: false, notEncounteredReasons: ["Vehicle not found", "Lot closed", "Seller not present", "Address incorrect", "Unsafe", "Other"] });
  const ptSalvage = await storage.createProofTemplate({ name: "Salvage Yard", requiredPhotoCount: 5, requiredVideo: false, geoRequired: true, minDistanceRadius: 2000, allowGalleryUpload: false, notEncounteredReasons: ["Yard closed", "Part not found", "Vehicle not in yard", "Address incorrect", "Other"] });
  const ptOnlineItem = await storage.createProofTemplate({ name: "Online Item Check", requiredPhotoCount: 8, requiredVideo: false, geoRequired: false, allowGalleryUpload: false, notEncounteredReasons: ["Seller not present", "Item not as described", "Item missing", "Address incorrect", "Unsafe", "Other"] });
  const ptQuick = await storage.createProofTemplate({ name: "Quick Check", requiredPhotoCount: 1, requiredVideo: false, geoRequired: false, allowGalleryUpload: false, notEncounteredReasons: ["Location closed", "Unable to access", "Other"] });
  const ptQuick3 = await storage.createProofTemplate({ name: "Quick Check 3-Photo", requiredPhotoCount: 3, requiredVideo: false, geoRequired: false, allowGalleryUpload: false, notEncounteredReasons: ["Location closed", "Unable to access", "Other"] });
  const ptQuickVideo = await storage.createProofTemplate({ name: "Quick Check Video", requiredPhotoCount: 0, requiredVideo: true, videoDuration: "30s", geoRequired: false, allowGalleryUpload: false, notEncounteredReasons: ["Location closed", "Unable to access", "Other"] });
  const ptPartVerify = await storage.createProofTemplate({
    name: "Part Availability Verification",
    requiredPhotoCount: 3,
    requiredVideo: false,
    geoRequired: true,
    minDistanceRadius: 500,
    allowGalleryUpload: false,
    notEncounteredReasons: ["Part not found", "Location not accessible", "Location closed", "Item/vehicle not there", "Address incorrect", "Other"]
  });

  await storage.createProofChecklistItem({ templateId: ptProperty.id, label: "Front exterior", instruction: "Take a clear photo of the front of the property", mediaType: "photo", quantityRequired: 1, geoRequired: true, sortOrder: 1 });
  await storage.createProofChecklistItem({ templateId: ptProperty.id, label: "Entry/doorway", instruction: "Photo of the main entry point", mediaType: "photo", quantityRequired: 1, geoRequired: true, sortOrder: 2 });
  await storage.createProofChecklistItem({ templateId: ptProperty.id, label: "Living area", instruction: "Photo(s) of the main living space", mediaType: "photo", quantityRequired: 2, geoRequired: false, sortOrder: 3 });
  await storage.createProofChecklistItem({ templateId: ptProperty.id, label: "Kitchen", instruction: "Photo(s) of kitchen area and appliances", mediaType: "photo", quantityRequired: 2, geoRequired: false, sortOrder: 4 });
  await storage.createProofChecklistItem({ templateId: ptProperty.id, label: "Bathroom(s)", instruction: "Photo(s) of each bathroom", mediaType: "photo", quantityRequired: 2, geoRequired: false, sortOrder: 5 });
  await storage.createProofChecklistItem({ templateId: ptProperty.id, label: "Bedroom(s)", instruction: "Photo of each bedroom", mediaType: "photo", quantityRequired: 2, geoRequired: false, sortOrder: 6 });

  await storage.createProofChecklistItem({ templateId: ptVehicleBasic.id, label: "Front view", instruction: "Clear photo of vehicle front", mediaType: "photo", quantityRequired: 1, geoRequired: true, sortOrder: 1 });
  await storage.createProofChecklistItem({ templateId: ptVehicleBasic.id, label: "Rear view", instruction: "Clear photo of vehicle rear", mediaType: "photo", quantityRequired: 1, geoRequired: true, sortOrder: 2 });
  await storage.createProofChecklistItem({ templateId: ptVehicleBasic.id, label: "Driver side", instruction: "Full side photo", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 3 });
  await storage.createProofChecklistItem({ templateId: ptVehicleBasic.id, label: "Passenger side", instruction: "Full side photo", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 4 });
  await storage.createProofChecklistItem({ templateId: ptVehicleBasic.id, label: "Interior dashboard", instruction: "Dashboard and gauges", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 5 });
  await storage.createProofChecklistItem({ templateId: ptVehicleBasic.id, label: "VIN plate", instruction: "VIN number if visible", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 6 });
  await storage.createProofChecklistItem({ templateId: ptVehicleBasic.id, label: "Odometer", instruction: "Odometer reading if accessible", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 7 });

  await storage.createProofChecklistItem({ templateId: ptSalvage.id, label: "Yard signage", instruction: "Photo of yard sign/entrance", mediaType: "photo", quantityRequired: 1, geoRequired: true, sortOrder: 1 });
  await storage.createProofChecklistItem({ templateId: ptSalvage.id, label: "Donor vehicle", instruction: "Photo of donor vehicle with part visible", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 2 });
  await storage.createProofChecklistItem({ templateId: ptSalvage.id, label: "Part closeup", instruction: "Close-up of the part condition", mediaType: "photo", quantityRequired: 2, geoRequired: false, sortOrder: 3 });

  await storage.createProofChecklistItem({ templateId: ptOnlineItem.id, label: "Item overview", instruction: "Full view of the item", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 1 });
  await storage.createProofChecklistItem({ templateId: ptOnlineItem.id, label: "Condition details", instruction: "Close-up of any damage, wear, or defects", mediaType: "photo", quantityRequired: 2, geoRequired: false, sortOrder: 2 });
  await storage.createProofChecklistItem({ templateId: ptOnlineItem.id, label: "Serial/model tag", instruction: "Photo of serial or model tag if applicable", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 3 });
  await storage.createProofChecklistItem({ templateId: ptOnlineItem.id, label: "Power-on proof", instruction: "Photo or video showing item powers on (if electronic)", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 4 });

  await storage.createProofChecklistItem({ templateId: ptQuick.id, label: "Proof photo", instruction: "Take a single clear photo as confirmation", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 1 });
  await storage.createProofChecklistItem({ templateId: ptQuick3.id, label: "Proof photos", instruction: "Take 3 clear photos from different angles", mediaType: "photo", quantityRequired: 3, geoRequired: false, sortOrder: 1 });
  await storage.createProofChecklistItem({ templateId: ptQuickVideo.id, label: "Video proof", instruction: "Record a 30-second video as confirmation", mediaType: "video", quantityRequired: 1, geoRequired: false, sortOrder: 1 });

  // PART AVAILABILITY VERIFICATION — Checklist Items
  await storage.createProofChecklistItem({ templateId: ptPartVerify.id, label: "Location ID", instruction: "Photo of yard sign, building sign, row marker, or location reference", mediaType: "photo", quantityRequired: 1, geoRequired: true, sortOrder: 1 });
  await storage.createProofChecklistItem({ templateId: ptPartVerify.id, label: "Source Object", instruction: "Full view of vehicle, item, shelf, bin, or lot", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 2 });
  await storage.createProofChecklistItem({ templateId: ptPartVerify.id, label: "Part/Item Closeup", instruction: "Clear close-up of the specific requested part or item", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 3 });

  // PROPERTY & SITE CHECK — Use Cases
  const ucAirbnb = await storage.createUseCase({ viCategoryId: cat1.id, name: "Airbnb Turnover / Host Check", description: "Guest checkout verification, cleanliness sweep, damage check for short-term rental properties", minTier: "verified", sortOrder: 1 });
  const ucMoveOut = await storage.createUseCase({ viCategoryId: cat1.id, name: "Move-Out / Deposit Protection Check", description: "Document property condition at tenant move-out for deposit dispute protection", minTier: "verified", sortOrder: 2 });
  const ucMoveIn = await storage.createUseCase({ viCategoryId: cat1.id, name: "Move-In Condition Baseline", description: "Document property condition at move-in to establish a baseline", minTier: "community", sortOrder: 3 });
  const ucRoutine = await storage.createUseCase({ viCategoryId: cat1.id, name: "Remote Landlord Routine Check", description: "Remote property owner routine check on property condition", minTier: "community", sortOrder: 4 });
  const ucVacancy = await storage.createUseCase({ viCategoryId: cat1.id, name: "Vacancy / Occupancy Confirmation", description: "Confirm whether property appears occupied or vacant", minTier: "community", sortOrder: 5 });
  const ucExterior = await storage.createUseCase({ viCategoryId: cat1.id, name: "Exterior Only Check", description: "Low-risk exterior-only visual inspection of property", minTier: "community", sortOrder: 6 });
  const ucHOA = await storage.createUseCase({ viCategoryId: cat1.id, name: "HOA/Neighborhood Drive-By", description: "Visual-only neighborhood or HOA compliance drive-by check", minTier: "community", sortOrder: 7 });
  const ucUtilities = await storage.createUseCase({ viCategoryId: cat1.id, name: "Utilities/Fixtures Visual Check", description: "Visual check of utilities and fixtures — no guarantees, visual only", minTier: "community", sortOrder: 8 });

  // Airbnb service types
  await storage.createCatalogServiceType({ useCaseId: ucAirbnb.id, name: "Cleanliness + Damage Sweep", description: "Walk through property checking cleanliness and any damage after guest checkout", proofTemplateId: ptProperty.id, minTier: "verified", titleTemplate: "Airbnb Turnover - Cleanliness + Damage Sweep", descriptionTemplate: "Walk-through of short-term rental property to document cleanliness status and any damage from recent guest. Room-by-room photo documentation.", sortOrder: 1 });
  await storage.createCatalogServiceType({ useCaseId: ucAirbnb.id, name: "Supply/Restock Confirmation", description: "Visual confirmation that supplies are stocked for next guest", proofTemplateId: ptProperty.id, minTier: "verified", titleTemplate: "Airbnb Turnover - Supply/Restock Confirmation", descriptionTemplate: "Visual confirmation that all necessary supplies are restocked and available for the next guest arrival.", sortOrder: 2 });
  await storage.createCatalogServiceType({ useCaseId: ucAirbnb.id, name: "Lockbox/Entry Check", description: "Visual verification that lockbox and entry system are functional", proofTemplateId: ptProperty.id, minTier: "verified", titleTemplate: "Airbnb Turnover - Lockbox/Entry Check", descriptionTemplate: "Visual verification that lockbox or entry system is in place and accessible for guest arrival.", sortOrder: 3 });
  await storage.createCatalogServiceType({ useCaseId: ucAirbnb.id, name: "Photo Set Only", description: "Room-by-room photo documentation of key spots", proofTemplateId: ptProperty.id, minTier: "verified", titleTemplate: "Airbnb Turnover - Photo Set Only", descriptionTemplate: "Complete room-by-room photo documentation of the property for host records.", sortOrder: 4 });
  await storage.createCatalogServiceType({ useCaseId: ucAirbnb.id, name: "Ready for Guest Proof Package", description: "Full ready-for-guest verification with complete photo and video walkthrough", proofTemplateId: ptPropertyFull.id, minTier: "verified", titleTemplate: "Airbnb Turnover - Ready for Guest Proof Package", descriptionTemplate: "Comprehensive proof package verifying property is fully prepared for next guest arrival with complete photo and video documentation.", sortOrder: 5 });

  // Move-Out service types
  await storage.createCatalogServiceType({ useCaseId: ucMoveOut.id, name: "Full Condition Photo Set", description: "Room-by-room detailed condition documentation", proofTemplateId: ptPropertyFull.id, minTier: "verified", titleTemplate: "Move-Out - Full Condition Photo Set", descriptionTemplate: "Complete room-by-room photo documentation of property condition at move-out for deposit protection evidence.", sortOrder: 1 });
  await storage.createCatalogServiceType({ useCaseId: ucMoveOut.id, name: "Damage Focus Report", description: "Focused documentation of walls, floors, and fixtures damage", proofTemplateId: ptProperty.id, minTier: "verified", titleTemplate: "Move-Out - Damage Focus Report", descriptionTemplate: "Focused photo documentation of any damage to walls, floors, and fixtures for deposit dispute evidence.", sortOrder: 2 });
  await storage.createCatalogServiceType({ useCaseId: ucMoveOut.id, name: "Appliance Condition Check", description: "Visual condition check of all appliances", proofTemplateId: ptProperty.id, minTier: "verified", titleTemplate: "Move-Out - Appliance Condition Check", descriptionTemplate: "Visual documentation of all appliance conditions at move-out.", sortOrder: 3 });
  await storage.createCatalogServiceType({ useCaseId: ucMoveOut.id, name: "Trash/Personal Items Left Behind", description: "Document any trash or personal items left by tenant", proofTemplateId: ptProperty.id, minTier: "verified", titleTemplate: "Move-Out - Trash/Items Left Behind", descriptionTemplate: "Photo documentation of any trash or personal belongings left behind by departing tenant.", sortOrder: 4 });
  await storage.createCatalogServiceType({ useCaseId: ucMoveOut.id, name: "Deposit Defense Proof Package", description: "Complete deposit defense documentation package with full video walkthrough", proofTemplateId: ptPropertyFull.id, minTier: "verified", titleTemplate: "Move-Out - Deposit Defense Proof Package", descriptionTemplate: "Comprehensive proof package for deposit dispute defense including room-by-room photos and video walkthrough.", sortOrder: 5 });

  // Move-In service types
  await storage.createCatalogServiceType({ useCaseId: ucMoveIn.id, name: "Room-by-Room Baseline", description: "Document baseline condition of every room", proofTemplateId: ptProperty.id, minTier: "community", titleTemplate: "Move-In - Room-by-Room Baseline", descriptionTemplate: "Room-by-room photo documentation establishing baseline condition at move-in.", sortOrder: 1 });
  await storage.createCatalogServiceType({ useCaseId: ucMoveIn.id, name: "Existing Damage Inventory", description: "Document all pre-existing damage before move-in", proofTemplateId: ptProperty.id, minTier: "community", titleTemplate: "Move-In - Existing Damage Inventory", descriptionTemplate: "Detailed photo documentation of all pre-existing damage before tenant move-in.", sortOrder: 2 });
  await storage.createCatalogServiceType({ useCaseId: ucMoveIn.id, name: "Key Areas Baseline", description: "Focus on kitchen, bath, and floors baseline documentation", proofTemplateId: ptProperty.id, minTier: "community", titleTemplate: "Move-In - Key Areas Baseline", descriptionTemplate: "Focused baseline documentation of key areas: kitchen, bathrooms, and flooring condition.", sortOrder: 3 });

  // Routine check service types
  await storage.createCatalogServiceType({ useCaseId: ucRoutine.id, name: "Entryway + Main Rooms + Exterior", description: "Standard routine check of entry, main living areas, and exterior", proofTemplateId: ptProperty.id, minTier: "community", titleTemplate: "Routine Check - Entry + Main + Exterior", descriptionTemplate: "Standard routine property check covering entryway, main rooms, and exterior condition.", sortOrder: 1 });
  await storage.createCatalogServiceType({ useCaseId: ucRoutine.id, name: "Safety Items Visual Check", description: "Visual check of smoke detectors and safety items — visual only", proofTemplateId: ptProperty.id, minTier: "community", titleTemplate: "Routine Check - Safety Items Visual", descriptionTemplate: "Visual-only check confirming smoke detectors and basic safety items are visibly present.", sortOrder: 2 });

  // Vacancy service types
  await storage.createCatalogServiceType({ useCaseId: ucVacancy.id, name: "Occupancy Visual Confirmation", description: "Visual confirmation of whether property appears occupied", proofTemplateId: ptQuick3.id, minTier: "community", titleTemplate: "Vacancy - Occupancy Visual Confirmation", descriptionTemplate: "Visual check from exterior to confirm whether property appears occupied or vacant.", sortOrder: 1 });

  // Exterior only
  await storage.createCatalogServiceType({ useCaseId: ucExterior.id, name: "Exterior Photo Set", description: "Full exterior photo documentation", proofTemplateId: ptQuick3.id, minTier: "community", titleTemplate: "Exterior Only - Photo Set", descriptionTemplate: "Complete exterior photo documentation of property from all accessible angles.", sortOrder: 1 });

  // HOA
  await storage.createCatalogServiceType({ useCaseId: ucHOA.id, name: "Drive-By Visual Report", description: "Visual-only neighborhood drive-by documentation", proofTemplateId: ptQuick3.id, minTier: "community", titleTemplate: "HOA/Neighborhood - Drive-By Visual Report", descriptionTemplate: "Visual-only drive-by documentation of property and surrounding neighborhood.", sortOrder: 1 });

  // Utilities
  await storage.createCatalogServiceType({ useCaseId: ucUtilities.id, name: "Fixtures Visual Check", description: "Visual check of utilities and fixtures — no guarantees", proofTemplateId: ptProperty.id, minTier: "community", titleTemplate: "Utilities/Fixtures - Visual Check", descriptionTemplate: "Visual-only check of utilities and fixtures. No operational guarantees implied.", sortOrder: 1 });

  // WHEELS, WINGS & WATER — Use Cases
  const ucAuction = await storage.createUseCase({ viCategoryId: cat2.id, name: "Auction Lot Verification", description: "Verify vehicle condition at an auction lot before bidding", minTier: "verified", sortOrder: 1 });
  const ucDealer = await storage.createUseCase({ viCategoryId: cat2.id, name: "Dealership Lot Verification", description: "Verify vehicle condition at a dealership", minTier: "verified", sortOrder: 2 });
  const ucPrivate = await storage.createUseCase({ viCategoryId: cat2.id, name: "Private Seller Verification", description: "Verify vehicle condition from a private seller", minTier: "verified", sortOrder: 3 });
  const ucStorage = await storage.createUseCase({ viCategoryId: cat2.id, name: "Storage Yard Verification", description: "Verify vehicle condition in a storage yard", minTier: "community", sortOrder: 4 });
  const ucVIN = await storage.createUseCase({ viCategoryId: cat2.id, name: "VIN / Odometer / Condition Proof", description: "Focused VIN, odometer, and overall condition documentation", minTier: "community", sortOrder: 5 });
  const ucSalvage = await storage.createUseCase({ viCategoryId: cat2.id, name: "Salvage Yard Part Availability", description: "Confirm part exists in salvage yard. OPEN TO ALL — visual proof only", minTier: "community", sortOrder: 6 });
  const ucBoat = await storage.createUseCase({ viCategoryId: cat2.id, name: "Boat / Jet Ski Visual Verification", description: "Visual verification of boat or jet ski condition", minTier: "verified", sortOrder: 7 });
  const ucMoto = await storage.createUseCase({ viCategoryId: cat2.id, name: "Motorcycle Visual Verification", description: "Visual verification of motorcycle condition", minTier: "verified", sortOrder: 8 });

  // Vehicle service types (shared across multiple use cases)
  const vehicleServiceTypes = [
    { name: "Basic Visual Pack (10 photos)", description: "10 photos covering all major angles and visible condition", proofTemplateId: ptVehicleBasic.id, minTier: "community", titleTemplate: "{useCase} - Basic Visual Pack", descriptionTemplate: "10-photo visual documentation covering all major angles and visible condition. Visual only — no diagnosis.", sortOrder: 1 },
    { name: "Standard Pack (25 photos + walkaround video)", description: "25 photos plus walkaround video for comprehensive documentation", proofTemplateId: ptVehicleStandard.id, minTier: "verified", titleTemplate: "{useCase} - Standard Pack", descriptionTemplate: "Comprehensive 25-photo pack with walkaround video showing all angles, interior, and any visible issues.", sortOrder: 2 },
    { name: "Auction Pack (VIN + odometer + damage focus)", description: "Auction-focused pack with VIN, odometer, and damage documentation", proofTemplateId: ptVehicleStandard.id, minTier: "verified", titleTemplate: "{useCase} - Auction Pack", descriptionTemplate: "Auction-focused documentation: VIN verification, odometer reading, and detailed damage photos.", sortOrder: 3 },
    { name: "Title/VIN Tag Focus", description: "Visual-only focus on title and VIN tag documentation", proofTemplateId: ptVehicleBasic.id, minTier: "community", titleTemplate: "{useCase} - Title/VIN Tag Focus", descriptionTemplate: "Focused visual documentation of title document and VIN tag. Visual only.", sortOrder: 4 },
    { name: "Start Attempt Pack", description: "Recorded start attempt — no guarantee of outcome", proofTemplateId: ptVehicleStandard.id, minTier: "verified", titleTemplate: "{useCase} - Start Attempt Pack", descriptionTemplate: "Recorded video of engine start attempt. No guarantee of outcome — documentation only.", sortOrder: 5 },
    { name: "Tire/Brake Visual Pack", description: "Visual inspection of tire and brake condition", proofTemplateId: ptVehicleBasic.id, minTier: "community", titleTemplate: "{useCase} - Tire/Brake Visual Pack", descriptionTemplate: "Visual documentation of tire tread, brake pad visibility, and wheel condition.", sortOrder: 6 },
    { name: "Interior Condition Pack", description: "Interior-focused condition documentation", proofTemplateId: ptVehicleBasic.id, minTier: "community", titleTemplate: "{useCase} - Interior Condition Pack", descriptionTemplate: "Focused interior documentation: seats, dashboard, carpet, headliner, and controls condition.", sortOrder: 7 },
  ];

  for (const uc of [ucAuction, ucDealer, ucPrivate, ucStorage, ucVIN, ucBoat, ucMoto]) {
    for (const st of vehicleServiceTypes) {
      await storage.createCatalogServiceType({ ...st, useCaseId: uc.id });
    }
  }

  // Salvage yard service type (open to all)
  await storage.createCatalogServiceType({ useCaseId: ucSalvage.id, name: "Part Availability Confirmation", description: "Visual proof that part exists in salvage yard — visual only, no fitment guarantee", proofTemplateId: ptSalvage.id, minTier: "community", titleTemplate: "Salvage Yard - Part Availability Confirmation", descriptionTemplate: "Visual confirmation that requested part is present in the salvage yard. NO fitment guarantee, NO diagnosis. Visual tags only: intact/damaged/missing.", sortOrder: 1 });

  // ONLINE ITEMS — Use Cases
  const ucMarketplace = await storage.createUseCase({ viCategoryId: cat3.id, name: "Marketplace Item Verification", description: "Verify items listed on FB Marketplace, OfferUp, etc.", minTier: "community", sortOrder: 1 });
  const ucHighValue = await storage.createUseCase({ viCategoryId: cat3.id, name: "High-Value Item Authenticity Basics", description: "Visual-only authenticity basics for high-value items", minTier: "verified", sortOrder: 2 });
  const ucElectronics = await storage.createUseCase({ viCategoryId: cat3.id, name: "Electronics Power-On Proof", description: "Visual proof that electronic item powers on", minTier: "community", sortOrder: 3 });
  const ucFurniture = await storage.createUseCase({ viCategoryId: cat3.id, name: "Furniture Condition Proof", description: "Document furniture condition with detail photos", minTier: "community", sortOrder: 4 });
  const ucTools = await storage.createUseCase({ viCategoryId: cat3.id, name: "Tool/Equipment Condition Proof", description: "Document tool or equipment condition", minTier: "community", sortOrder: 5 });
  const ucSerial = await storage.createUseCase({ viCategoryId: cat3.id, name: "Serial/Model Tag Confirmation", description: "Confirm serial or model number matches listing", minTier: "community", sortOrder: 6 });

  const onlineServiceTypes = [
    { name: "Is It Real + Is It There Pack", description: "Confirm item exists and appears as described in listing", sortOrder: 1 },
    { name: "Condition Closeups + Tags Pack", description: "Close-up photos of condition, tags, labels, and any defects", sortOrder: 2 },
    { name: "Power-On + Screen + Ports Pack", description: "Verify electronics power on with screen and ports visible", sortOrder: 3 },
    { name: "Included Accessories Proof Pack", description: "Document all included accessories and contents", sortOrder: 4 },
  ];

  for (const uc of [ucMarketplace, ucHighValue, ucElectronics, ucFurniture, ucTools, ucSerial]) {
    for (const st of onlineServiceTypes) {
      await storage.createCatalogServiceType({ ...st, useCaseId: uc.id, proofTemplateId: ptOnlineItem.id, minTier: uc.minTier, titleTemplate: `${uc.name} - ${st.name}`, descriptionTemplate: st.description });
    }
  }

  // QUICK CHECK — Use Cases
  const ucStoreOpen = await storage.createUseCase({ viCategoryId: cat4.id, name: "Store Open/Closed Confirmation", description: "Confirm whether a store or business is open or closed", minTier: "community", sortOrder: 1 });
  const ucItemPresent = await storage.createUseCase({ viCategoryId: cat4.id, name: "Item Is Present Confirmation", description: "Confirm that a specific item is present at a location", minTier: "community", sortOrder: 2 });
  const ucSignPosted = await storage.createUseCase({ viCategoryId: cat4.id, name: "Sign Posted Confirmation", description: "Confirm that a sign is posted at a location", minTier: "community", sortOrder: 3 });
  const ucPropertyOccupied = await storage.createUseCase({ viCategoryId: cat4.id, name: "Property Looks Occupied", description: "Visual check of whether property appears occupied", minTier: "community", sortOrder: 4 });
  const ucLineLength = await storage.createUseCase({ viCategoryId: cat4.id, name: "Line Length / Wait Time", description: "Visual estimate of line length or wait time", minTier: "community", sortOrder: 5 });

  // PART AVAILABILITY VERIFICATION — Category & Use Cases
  const cat5 = await storage.createVICategory({ name: "Part Availability Verification", description: "Bounty-mode part searching and availability verification", icon: "search", sortOrder: 5 });

  const ucVerifyLoc = await storage.createUseCase({ viCategoryId: cat5.id, name: "Verify Specific Location", description: "Confirm a part/item exists at a specific location", minTier: "community", sortOrder: 1 });
  const ucSearchPlace = await storage.createUseCase({ viCategoryId: cat5.id, name: "Search Known Place", description: "Search a full yard/location for a part/item", minTier: "community", sortOrder: 2 });
  const ucSearchMulti = await storage.createUseCase({ viCategoryId: cat5.id, name: "Search Multiple Places", description: "Search within a radius for a part/item", minTier: "community", sortOrder: 3 });
  const ucGeneralLead = await storage.createUseCase({ viCategoryId: cat5.id, name: "General Lead Verification", description: "Verify an unconfirmed tip or lead", minTier: "community", sortOrder: 4 });

  await storage.createCatalogServiceType({
    useCaseId: ucVerifyLoc.id,
    name: "Part/Item at Specific Spot",
    description: "Confirm a part/item exists at a specific location. $8–$15 typical",
    proofTemplateId: ptPartVerify.id,
    minTier: "community",
    titleTemplate: "Part Verify: {partDescription} @ {locationName}",
    descriptionTemplate: "Verification of {partDescription} at {locationName}.",
    sortOrder: 1
  });

  await storage.createCatalogServiceType({
    useCaseId: ucSearchPlace.id,
    name: "Search Entire Location for Part",
    description: "Search a full yard/location for a part/item. $15–$25 typical",
    proofTemplateId: ptPartVerify.id,
    minTier: "community",
    titleTemplate: "Part Search: {partDescription} @ {locationName}",
    descriptionTemplate: "Comprehensive search for {partDescription} throughout {locationName}.",
    sortOrder: 1
  });

  await storage.createCatalogServiceType({
    useCaseId: ucSearchMulti.id,
    name: "Multi-Location Search (Radius)",
    description: "Search within a radius for a part/item. $25–$40 typical",
    proofTemplateId: ptPartVerify.id,
    minTier: "community",
    titleTemplate: "Part Search: {partDescription} within {radius}",
    descriptionTemplate: "Search for {partDescription} across multiple locations within {radius} radius.",
    sortOrder: 1
  });

  await storage.createCatalogServiceType({
    useCaseId: ucGeneralLead.id,
    name: "Unconfirmed Lead Verification",
    description: "Verify an unconfirmed tip or lead. $15–$30 typical",
    proofTemplateId: ptPartVerify.id,
    minTier: "community",
    titleTemplate: "Lead Verify: {partDescription}",
    descriptionTemplate: "Verification of unconfirmed lead for {partDescription}.",
    sortOrder: 1
  });

  const quickServiceTypes = [
    { name: "1 Photo Proof", proofTemplateId: ptQuick.id, sortOrder: 1 },
    { name: "3 Photo Proof", proofTemplateId: ptQuick3.id, sortOrder: 2 },
    { name: "30s Video Proof", proofTemplateId: ptQuickVideo.id, sortOrder: 3 },
    { name: "Photo + Timestamp Proof", proofTemplateId: ptQuick.id, sortOrder: 4 },
  ];

  for (const uc of [ucStoreOpen, ucItemPresent, ucSignPosted, ucPropertyOccupied, ucLineLength]) {
    for (const st of quickServiceTypes) {
      await storage.createCatalogServiceType({ ...st, useCaseId: uc.id, minTier: "community", name: st.name, description: `${uc.name} with ${st.name.toLowerCase()}`, titleTemplate: `${uc.name} - ${st.name}`, descriptionTemplate: `Quick check: ${uc.description}. Proof type: ${st.name}.` });
    }
  }

  // DETAIL OPTION SETS — Property & Site Check (Layer 4)
  const propDetails = [
    { viCategoryId: cat1.id, name: "propertyType", label: "Property Type", fieldType: "dropdown", options: ["House", "Apartment", "Condo", "Townhome", "Room"], sortOrder: 1 },
    { viCategoryId: cat1.id, name: "bedrooms", label: "Bedrooms", fieldType: "dropdown", options: ["0", "1", "2", "3", "4", "5", "6+"], sortOrder: 2 },
    { viCategoryId: cat1.id, name: "bathrooms", label: "Bathrooms", fieldType: "dropdown", options: ["1", "2", "3", "4", "5+"], sortOrder: 3 },
    { viCategoryId: cat1.id, name: "areasRequired", label: "Areas Required", fieldType: "dropdown", options: ["Living", "Kitchen", "Baths", "Bedrooms", "Garage", "Backyard", "Balcony", "Basement"], sortOrder: 4 },
    { viCategoryId: cat1.id, name: "accessMethod", label: "Access Method", fieldType: "dropdown", options: ["Host present", "Keypad", "Lockbox", "Front desk", "Other"], sortOrder: 5 },
    { viCategoryId: cat1.id, name: "photoIntensity", label: "Photo Intensity", fieldType: "dropdown", options: ["Standard", "Expanded", "Max Evidence"], sortOrder: 6 },
    { viCategoryId: cat1.id, name: "videoRequired", label: "Video", fieldType: "dropdown", options: ["None", "30s walkthrough", "2-min walkthrough"], sortOrder: 7 },
  ];

  for (const d of propDetails) {
    await storage.createDetailOptionSet(d);
  }

  // DETAIL OPTION SETS — Wheels, Wings & Water (Layer 4)
  const vehicleDetails = [
    { viCategoryId: cat2.id, name: "vehicleType", label: "Vehicle Type", fieldType: "dropdown", options: ["Car", "Truck", "SUV", "Motorcycle", "Boat", "Jet Ski", "Other"], sortOrder: 1 },
    { viCategoryId: cat2.id, name: "conditionFocus", label: "Condition Focus", fieldType: "dropdown", options: ["Cosmetic", "Damage", "Rust", "Interior", "Underbody (visual)"], sortOrder: 2 },
    { viCategoryId: cat2.id, name: "vinRequired", label: "VIN Required", fieldType: "dropdown", options: ["Yes", "No"], sortOrder: 3 },
    { viCategoryId: cat2.id, name: "odometerRequired", label: "Odometer Required", fieldType: "dropdown", options: ["Yes", "No"], sortOrder: 4 },
    { viCategoryId: cat2.id, name: "videoRequired", label: "Video Required", fieldType: "dropdown", options: ["None", "30s", "2min"], sortOrder: 5 },
    { viCategoryId: cat2.id, name: "locationType", label: "Location Type", fieldType: "dropdown", options: ["Auction", "Dealer", "Private", "Yard"], sortOrder: 6 },
  ];

  for (const d of vehicleDetails) {
    await storage.createDetailOptionSet(d);
  }

  // DETAIL OPTION SETS — Online Items (Layer 4)
  const onlineDetails = [
    { viCategoryId: cat3.id, name: "itemCategory", label: "Item Category", fieldType: "dropdown", options: ["Electronics", "Tools", "Furniture", "Clothing", "Collectibles", "Auto Parts", "Other"], sortOrder: 1 },
    { viCategoryId: cat3.id, name: "valueRange", label: "Value Range", fieldType: "dropdown", options: ["Under $100", "$100-$500", "$500-$2,000", "$2,000+"], sortOrder: 2 },
    { viCategoryId: cat3.id, name: "serialRequired", label: "Serial Required", fieldType: "dropdown", options: ["Yes", "No"], sortOrder: 3 },
    { viCategoryId: cat3.id, name: "functionalDemo", label: "Functional Demo Required", fieldType: "dropdown", options: ["Yes (visual only)", "No"], sortOrder: 4 },
  ];

  for (const d of onlineDetails) {
    await storage.createDetailOptionSet(d);
  }

  // DETAIL OPTION SETS — Quick Check (Layer 4)
  const quickDetails = [
    { viCategoryId: cat4.id, name: "timeWindow", label: "Time Window", fieldType: "dropdown", options: ["Now", "Within 1 hour", "Within 4 hours", "Today"], sortOrder: 1 },
    { viCategoryId: cat4.id, name: "proofType", label: "Proof Type", fieldType: "dropdown", options: ["Photo", "Video", "Both"], sortOrder: 2 },
  ];

  for (const d of quickDetails) {
    await storage.createDetailOptionSet(d);
  }

  console.log("V&I Catalog seeded successfully!");
}

export async function seedJobChecklists() {
  const checklistData: Array<{ category: string; serviceTypeName: string | null; name: string; label: string; fieldType: string; options?: string[]; required: boolean; sortOrder: number }> = [
    // On-Demand Help
    { category: "On-Demand Help", serviceTypeName: "Pet Care", name: "petType", label: "Type of pet", fieldType: "single_select", options: ["Dog", "Cat", "Bird", "Rabbit", "Reptile", "Other"], required: true, sortOrder: 1 },
    { category: "On-Demand Help", serviceTypeName: "Pet Care", name: "petCount", label: "Number of pets", fieldType: "number_input", required: true, sortOrder: 2 },
    { category: "On-Demand Help", serviceTypeName: "Pet Care", name: "services", label: "Services needed", fieldType: "multi_select", options: ["Feeding", "Walking", "Medication", "Overnight stay", "Grooming", "Vet transport"], required: true, sortOrder: 3 },
    { category: "On-Demand Help", serviceTypeName: "Errand Running", name: "errandType", label: "Type of errand", fieldType: "single_select", options: ["Grocery shopping", "Package pickup/dropoff", "Mail/post office", "Bank/ATM", "Pharmacy pickup", "Other"], required: true, sortOrder: 1 },
    { category: "On-Demand Help", serviceTypeName: "Errand Running", name: "receiptsRequired", label: "Receipts required", fieldType: "yes_no", required: true, sortOrder: 2 },
    { category: "On-Demand Help", serviceTypeName: "Delivery", name: "itemType", label: "What is being delivered", fieldType: "single_select", options: ["Documents", "Small package", "Large item", "Food/groceries", "Furniture", "Other"], required: true, sortOrder: 1 },
    { category: "On-Demand Help", serviceTypeName: "Delivery", name: "fragile", label: "Fragile items", fieldType: "yes_no", required: true, sortOrder: 2 },
    { category: "On-Demand Help", serviceTypeName: "Moving", name: "homeSize", label: "Home/space size", fieldType: "single_select", options: ["Studio", "1 Bedroom", "2 Bedroom", "3+ Bedroom", "Office/commercial", "Just a few items"], required: true, sortOrder: 1 },
    { category: "On-Demand Help", serviceTypeName: "Moving", name: "flightOfStairs", label: "Flights of stairs", fieldType: "number_input", required: false, sortOrder: 2 },
    { category: "On-Demand Help", serviceTypeName: "Moving", name: "helpersNeeded", label: "Helpers needed", fieldType: "single_select", options: ["1", "2", "3", "4+"], required: true, sortOrder: 3 },
    { category: "On-Demand Help", serviceTypeName: "Tech Support", name: "deviceType", label: "Device type", fieldType: "single_select", options: ["PC/Laptop", "Mac", "Phone/Tablet", "Printer/Scanner", "Smart TV", "Router/Network", "Other"], required: true, sortOrder: 1 },
    { category: "On-Demand Help", serviceTypeName: "Tech Support", name: "issueType", label: "Issue type", fieldType: "multi_select", options: ["Setup/Installation", "Virus/Malware", "Slow performance", "Hardware repair", "Data recovery", "Internet/WiFi", "Other"], required: true, sortOrder: 2 },

    // General Labor
    { category: "General Labor", serviceTypeName: "Lawn Care", name: "services", label: "Services needed", fieldType: "multi_select", options: ["Mowing", "Edging", "Weed eating", "Blowing", "Leaf removal", "Mulching", "Hedge trimming"], required: true, sortOrder: 1 },
    { category: "General Labor", serviceTypeName: "Lawn Care", name: "yardSize", label: "Yard size (approx)", fieldType: "single_select", options: ["Small (< 1/4 acre)", "Medium (1/4–1/2 acre)", "Large (1/2–1 acre)", "Very large (1+ acre)"], required: true, sortOrder: 2 },
    { category: "General Labor", serviceTypeName: "Lawn Care", name: "equipmentProvided", label: "Equipment provided by poster", fieldType: "yes_no", required: true, sortOrder: 3 },
    { category: "General Labor", serviceTypeName: "House Cleaning", name: "homeType", label: "Home type", fieldType: "single_select", options: ["Apartment", "House", "Condo", "Office", "Commercial"], required: true, sortOrder: 1 },
    { category: "General Labor", serviceTypeName: "House Cleaning", name: "bedrooms", label: "Number of bedrooms", fieldType: "number_input", required: true, sortOrder: 2 },
    { category: "General Labor", serviceTypeName: "House Cleaning", name: "cleaningType", label: "Cleaning type", fieldType: "single_select", options: ["Standard clean", "Deep clean", "Move-in/move-out", "Post-construction", "Office cleaning"], required: true, sortOrder: 3 },
    { category: "General Labor", serviceTypeName: "Pressure Washing", name: "surfaces", label: "Surfaces to clean", fieldType: "multi_select", options: ["Driveway", "Deck/patio", "House exterior", "Fence", "Sidewalk", "Roof", "Vehicle"], required: true, sortOrder: 1 },
    { category: "General Labor", serviceTypeName: "Junk Removal", name: "itemTypes", label: "Items to remove", fieldType: "multi_select", options: ["Furniture", "Appliances", "Electronics", "Construction debris", "Yard waste", "General junk"], required: true, sortOrder: 1 },
    { category: "General Labor", serviceTypeName: "Junk Removal", name: "volumeEstimate", label: "Volume estimate", fieldType: "single_select", options: ["Trunk load", "Small trailer", "Full truck bed", "Multiple truck loads"], required: true, sortOrder: 2 },

    // Skilled Labor
    { category: "Skilled Labor", serviceTypeName: "Electrical", name: "jobType", label: "Type of electrical work", fieldType: "single_select", options: ["Outlet/switch replacement", "Light fixture install", "Panel work", "Wiring", "EV charger install", "Other"], required: true, sortOrder: 1 },
    { category: "Skilled Labor", serviceTypeName: "Electrical", name: "permitNeeded", label: "Permit likely needed", fieldType: "yes_no", required: false, sortOrder: 2 },
    { category: "Skilled Labor", serviceTypeName: "Plumbing", name: "jobType", label: "Type of plumbing work", fieldType: "single_select", options: ["Leak repair", "Fixture install", "Drain clog", "Water heater", "Pipe replacement", "Other"], required: true, sortOrder: 1 },
    { category: "Skilled Labor", serviceTypeName: "Plumbing", name: "urgency", label: "Urgency level", fieldType: "single_select", options: ["Emergency (active leak)", "Urgent (24 hrs)", "Standard (within a week)", "Flexible"], required: true, sortOrder: 2 },
    { category: "Skilled Labor", serviceTypeName: "Painting", name: "surfaces", label: "Surfaces to paint", fieldType: "multi_select", options: ["Interior walls", "Exterior siding", "Trim/molding", "Ceiling", "Deck/fence", "Cabinets"], required: true, sortOrder: 1 },
    { category: "Skilled Labor", serviceTypeName: "Painting", name: "squareFootage", label: "Approx sq ft", fieldType: "single_select", options: ["< 200 sq ft", "200–500 sq ft", "500–1000 sq ft", "1000–2000 sq ft", "2000+ sq ft"], required: true, sortOrder: 2 },
    { category: "Skilled Labor", serviceTypeName: "Carpentry", name: "jobType", label: "Type of carpentry", fieldType: "single_select", options: ["Deck build/repair", "Fence build/repair", "Door/window framing", "Trim/molding install", "Custom cabinet", "Framing/structural", "Other"], required: true, sortOrder: 1 },

    // Barter Labor
    { category: "Barter Labor", serviceTypeName: null, name: "offerType", label: "What are you offering in exchange", fieldType: "single_select", options: ["Skill/labor trade", "Items/goods", "Both skill and items", "Gift card/store credit"], required: true, sortOrder: 1 },
    { category: "Barter Labor", serviceTypeName: null, name: "valueEstimate", label: "Estimated trade value", fieldType: "single_select", options: ["Under $25", "$25–$50", "$50–$100", "$100–$250", "$250+"], required: true, sortOrder: 2 },
  ];

  for (const item of checklistData) {
    try {
      const existing = await storage.getJobChecklists(item.category, item.serviceTypeName ?? undefined);
      const alreadyExists = existing.some(e => e.name === item.name && e.serviceTypeName === item.serviceTypeName);
      if (!alreadyExists) {
        await storage.createJobChecklist({
          category: item.category,
          serviceTypeName: item.serviceTypeName,
          name: item.name,
          label: item.label,
          fieldType: item.fieldType,
          options: item.options || null,
          required: item.required,
          sortOrder: item.sortOrder,
          useCaseId: null,
          viCategoryId: null,
        });
      }
    } catch (e) {
      console.error(`[seed] checklist item error (${item.category}/${item.name}):`, e);
    }
  }
  console.log("[GUBER] Job checklists seeded.");
}

export async function syncAdminCredentials() {
  try {
    const adminUser = await storage.getUserByEmail("admin@guberapp.com");
    const correctHash = await hashPassword("Bouncer76!");
    if (adminUser) {
      await storage.updateUser(adminUser.id, { password: correctHash, role: "admin", tier: "elite", day1OG: true });
      console.log("[GUBER] Admin password synced.");
    } else {
      let adminUsername = "guberadmin";
      const existingUsername = await storage.getUserByUsername("guberadmin");
      if (existingUsername) adminUsername = `guberadmin${Date.now()}`;
      await storage.createUser({
        email: "admin@guberapp.com",
        username: adminUsername,
        fullName: "GUBER Admin",
        password: correctHash,
        role: "admin",
        tier: "elite",
        trustScore: 500,
        day1OG: true,
        zipcode: "27401",
        skills: "Platform Management, Support",
        isAvailable: true,
        emailVerified: true,
      });
      console.log("[GUBER] Admin account created with Bouncer76!");
    }
    const ownerUser = await storage.getUserByEmail("dtb.rightpricemotorsllc@gmail.com");
    if (ownerUser && ownerUser.role !== "admin") {
      await storage.updateUser(ownerUser.id, { role: "admin", tier: "elite", day1OG: true });
      console.log("[GUBER] Owner account promoted to admin.");
    }
  } catch (e) {
    console.error("[GUBER] syncAdminCredentials error:", e);
  }
}

async function seed() {
  console.log("Seeding database...");

  await syncAdminCredentials();

  const existing = await storage.getUserByEmail("admin@guberapp.com");
  if (existing) {
    console.log("Database already seeded. Skipping users/jobs.");
  } else {
    const password = await hashPassword("Bouncer76!");

    const admin = await storage.createUser({
      email: "admin@guberapp.com",
      username: "guberadmin",
      fullName: "GUBER Admin",
      password,
      role: "admin",
      tier: "elite",
      trustScore: 500,
      day1OG: true,
      zipcode: "27401",
      skills: "Platform Management, Support",
      isAvailable: true,
    });

    const marcus = await storage.createUser({
      email: "marcus@example.com",
      username: "marcusj",
      fullName: "Marcus Johnson",
      password,
      role: "both",
      tier: "verified",
      trustScore: 180,
      jobsCompleted: 24,
      rating: 4.8,
      reviewCount: 18,
      day1OG: true,
      zipcode: "27403",
      skills: "Plumbing, Electrical, HVAC, Drywall",
      isAvailable: true,
      userBio: "Licensed plumber with 12 years experience.",
    });

    const keisha = await storage.createUser({
      email: "keisha@example.com",
      username: "keishab",
      fullName: "Keisha Brown",
      password,
      role: "helper",
      tier: "community",
      trustScore: 55,
      jobsCompleted: 8,
      rating: 4.6,
      reviewCount: 7,
      day1OG: false,
      zipcode: "27405",
      skills: "Cleaning, Organization, Moving",
      isAvailable: true,
      userBio: "Hard worker. Available most weekdays.",
    });

    const david = await storage.createUser({
      email: "david@example.com",
      username: "davidt",
      fullName: "David Torres",
      password,
      role: "buyer",
      tier: "community",
      trustScore: 30,
      jobsCompleted: 3,
      rating: 5.0,
      reviewCount: 2,
      day1OG: false,
      zipcode: "27410",
      userBio: "Business owner needing reliable help.",
    });

    const sarah = await storage.createUser({
      email: "sarah@example.com",
      username: "sarahw",
      fullName: "Sarah Williams",
      password,
      role: "both",
      tier: "verified",
      trustScore: 220,
      jobsCompleted: 31,
      rating: 4.9,
      reviewCount: 28,
      day1OG: true,
      zipcode: "27406",
      skills: "Auto Repair, Welding, Fabrication, Inspection",
      isAvailable: true,
      userBio: "ASE certified mechanic. Domestic vehicles and inspections.",
    });

    const catData = [
      { name: "On-Demand Help", icon: "zap", color: "#9C27B0" },
      { name: "General Labor", icon: "wrench", color: "#2E7D32" },
      { name: "Skilled Labor", icon: "hammer", color: "#827717" },
      { name: "Verify & Inspect", icon: "search", color: "#1565C0" },
      { name: "Barter Labor", icon: "repeat", color: "#512DA8" },
      { name: "Marketplace", icon: "shopping-bag", color: "#00796B" },
    ];

    for (const c of catData) {
      try { await storage.createCategory(c.name, c.icon, c.color); } catch {}
    }

    const serviceData = [
      { name: "Pet Care", category: "On-Demand Help" },
      { name: "Errand Running", category: "On-Demand Help" },
      { name: "Delivery", category: "On-Demand Help" },
      { name: "Personal Assistant", category: "On-Demand Help" },
      { name: "Tutoring", category: "On-Demand Help" },
      { name: "Tech Support", category: "On-Demand Help" },
      { name: "Event Help", category: "On-Demand Help" },
      { name: "House Sitting", category: "On-Demand Help" },
      { name: "Moving", category: "General Labor" },
      { name: "Lawn Care", category: "General Labor" },
      { name: "Cleaning", category: "General Labor" },
      { name: "Hauling", category: "General Labor" },
      { name: "Assembly", category: "General Labor" },
      { name: "Demolition", category: "General Labor" },
      { name: "Pressure Washing", category: "General Labor" },
      { name: "Junk Removal", category: "General Labor" },
      { name: "Plumbing", category: "Skilled Labor", requiresCredential: true, minTier: "verified" },
      { name: "Electrical", category: "Skilled Labor", requiresCredential: true, minTier: "verified" },
      { name: "HVAC", category: "Skilled Labor", requiresCredential: true, minTier: "verified" },
      { name: "Carpentry", category: "Skilled Labor", minTier: "verified" },
      { name: "Drywall", category: "Skilled Labor", minTier: "verified" },
      { name: "Painting", category: "Skilled Labor", minTier: "verified" },
      { name: "Welding", category: "Skilled Labor", requiresCredential: true, minTier: "verified" },
      { name: "Auto Repair", category: "Skilled Labor", requiresCredential: true, minTier: "verified" },
      { name: "Roofing", category: "Skilled Labor", minTier: "verified" },
      { name: "Flooring", category: "Skilled Labor", minTier: "verified" },
      { name: "Trade Services", category: "Barter Labor" },
      { name: "Skill Exchange", category: "Barter Labor" },
      { name: "Item Exchange", category: "Barter Labor" },
      { name: "Buy/Sell", category: "Marketplace" },
      { name: "Rent", category: "Marketplace" },
      { name: "Free Items", category: "Marketplace" },
    ];

    for (const s of serviceData) {
      try { await storage.createServiceType(s); } catch {}
    }

    await storage.createJob({
      title: "Moving - General Labor",
      category: "General Labor",
      budget: 150,
      location: "123 Main St, Greensboro, NC",
      locationApprox: "Greensboro, NC 27403 area",
      zip: "27403",
      payType: "Flat Rate",
      serviceType: "Moving",
      urgentSwitch: false,
      urgentFee: 0,
      postedById: david.id,
      status: "posted_public",
      isPublished: true,
      isPaid: true,
    });

    await storage.createJob({
      title: "Plumbing - Skilled Labor",
      category: "Skilled Labor",
      budget: 120,
      location: "456 Oak Ave, High Point, NC",
      locationApprox: "High Point, NC 27260 area",
      zip: "27260",
      payType: "Flat Rate",
      serviceType: "Plumbing",
      urgentSwitch: true,
      urgentFee: 10,
      postedById: david.id,
      status: "posted_public",
      isPublished: true,
      isPaid: true,
    });

    await storage.createJob({
      title: "Pet Care - On-Demand Help",
      category: "On-Demand Help",
      budget: 75,
      location: "789 Elm St, Greensboro, NC",
      locationApprox: "Greensboro, NC 27401 area",
      zip: "27401",
      payType: "Flat Rate",
      serviceType: "Pet Care",
      urgentSwitch: true,
      urgentFee: 10,
      postedById: sarah.id,
      status: "posted_public",
      isPublished: true,
      isPaid: true,
    });

    await storage.createNotification({
      userId: admin.id,
      title: "Platform Launch",
      body: "Welcome to GUBER Admin! Full admin access to manage users, jobs, and disputes.",
      type: "system",
    });

    console.log("Users and jobs seeded!");
  }

  await seedCatalog();

  console.log("Seed complete!");
  console.log(`Admin: admin@guberapp.com / password123`);
  console.log(`Users: marcus, keisha, david, sarah @example.com / password123`);
}

if (process.argv[1]?.includes("seed")) {
  seed().catch(console.error).then(() => process.exit(0));
}

export async function seedPAVCategory() {
  try {
    const existing = await db.select().from(viCategories).where(eq(viCategories.name, "Part Availability Verification"));
    if (existing.length > 0) return;

    const ptPartVerify = await storage.createProofTemplate({
      name: "Part Availability Verification",
      requiredPhotoCount: 3,
      requiredVideo: false,
      geoRequired: true,
      minDistanceRadius: 500,
      allowGalleryUpload: false,
      notEncounteredReasons: ["Part not found", "Location not accessible", "Location closed", "Item/vehicle not there", "Address incorrect", "Other"],
    });

    await storage.createProofChecklistItem({ templateId: ptPartVerify.id, label: "Location ID", instruction: "Photo of yard sign, building sign, row marker, or location reference", mediaType: "photo", quantityRequired: 1, geoRequired: true, sortOrder: 1 });
    await storage.createProofChecklistItem({ templateId: ptPartVerify.id, label: "Source Object", instruction: "Full view of vehicle, item, shelf, bin, or lot", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 2 });
    await storage.createProofChecklistItem({ templateId: ptPartVerify.id, label: "Part/Item Closeup", instruction: "Clear close-up of the specific requested part or item", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 3 });

    const cat5 = await storage.createVICategory({ name: "Part Availability Verification", description: "Bounty-mode part searching and availability verification", icon: "search", sortOrder: 5 });

    const ucVerifyLoc = await storage.createUseCase({ viCategoryId: cat5.id, name: "Verify Specific Location", description: "Confirm a part/item exists at a specific location", minTier: "community", sortOrder: 1 });
    const ucSearchPlace = await storage.createUseCase({ viCategoryId: cat5.id, name: "Search Known Place", description: "Search a full yard/location for a part/item", minTier: "community", sortOrder: 2 });
    const ucSearchMulti = await storage.createUseCase({ viCategoryId: cat5.id, name: "Search Multiple Places", description: "Search within a radius for a part/item", minTier: "community", sortOrder: 3 });
    const ucGeneralLead = await storage.createUseCase({ viCategoryId: cat5.id, name: "General Lead Verification", description: "Verify an unconfirmed tip or lead", minTier: "community", sortOrder: 4 });

    await storage.createCatalogServiceType({ useCaseId: ucVerifyLoc.id, name: "Part/Item at Specific Spot", description: "Confirm a part/item exists at a specific location. $8–$15 typical", proofTemplateId: ptPartVerify.id, minTier: "community", titleTemplate: "Part Verify: {partDescription} @ {locationName}", descriptionTemplate: "Verification of {partDescription} at {locationName}.", sortOrder: 1 });
    await storage.createCatalogServiceType({ useCaseId: ucSearchPlace.id, name: "Search Entire Location for Part", description: "Search a full yard/location for a part/item. $15–$25 typical", proofTemplateId: ptPartVerify.id, minTier: "community", titleTemplate: "Part Search: {partDescription} @ {locationName}", descriptionTemplate: "Comprehensive search for {partDescription} throughout {locationName}.", sortOrder: 1 });
    await storage.createCatalogServiceType({ useCaseId: ucSearchMulti.id, name: "Multi-Location Search (Radius)", description: "Search within a radius for a part/item. $25–$40 typical", proofTemplateId: ptPartVerify.id, minTier: "community", titleTemplate: "Part Search: {partDescription} within {radius}", descriptionTemplate: "Search for {partDescription} across multiple locations within {radius} radius.", sortOrder: 1 });
    await storage.createCatalogServiceType({ useCaseId: ucGeneralLead.id, name: "Unconfirmed Lead Verification", description: "Verify an unconfirmed tip or lead. $15–$30 typical", proofTemplateId: ptPartVerify.id, minTier: "community", titleTemplate: "Lead Verify: {partDescription}", descriptionTemplate: "Verification of unconfirmed lead for {partDescription}.", sortOrder: 1 });

    console.log("[GUBER] Part Availability Verification category seeded.");
  } catch (e) {
    console.error("[GUBER] seedPAVCategory error:", e);
  }
}

function generateGuberId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "GUB-";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export async function seedPropertySituationsV2() {
  const cat = await db.select().from(viCategories).where(eq(viCategories.name, "Property & Site Check"));
  if (!cat.length) return;
  const catId = cat[0].id;

  const templates = await db.select().from(proofTemplates);
  const ptStandard = templates.find(t => t.name === "Property Standard");
  const ptQuick3 = templates.find(t => t.name === "Quick Check 3-Photo");
  const ptQuickVideo = templates.find(t => t.name === "Quick Check Video");

  const existing = await db.select().from(useCases).where(eq(useCases.viCategoryId, catId));
  const existingNames = new Set(existing.map(u => u.name));

  const newSituations: { name: string; description: string; minTier: string; proofTemplateId: number; serviceTypeName: string; sortOrder: number }[] = [
    { name: "Mail / Package Accumulation Check", description: "Check mailbox and front door for accumulated mail or packages indicating vacancy", minTier: "community", proofTemplateId: ptQuick3!.id, serviceTypeName: "Quick Visual Report", sortOrder: 9 },
    { name: "Door / Lock Security Check", description: "Verify door condition, visible locks, and entry points for security concerns", minTier: "community", proofTemplateId: ptQuick3!.id, serviceTypeName: "Security Visual Check", sortOrder: 10 },
    { name: "Damage Documentation Check", description: "Document property damage with close-up and wide-area photos for insurance or legal purposes", minTier: "community", proofTemplateId: ptStandard!.id, serviceTypeName: "Damage Report Package", sortOrder: 11 },
    { name: "Renovation / Work Progress Check", description: "Document work progress, materials on-site, and contractor activity for remote oversight", minTier: "community", proofTemplateId: ptStandard!.id, serviceTypeName: "Progress Photo Set", sortOrder: 12 },
    { name: "Vehicle / Activity Presence Check", description: "Confirm vehicle presence or general activity at a property or address", minTier: "community", proofTemplateId: ptQuick3!.id, serviceTypeName: "Presence Confirmation", sortOrder: 13 },
    { name: "Guest Activity / Party Check", description: "Observe and document guest activity, vehicle count, and noise level at a rental property", minTier: "verified", proofTemplateId: ptQuick3!.id, serviceTypeName: "Activity Observation Report", sortOrder: 14 },
    { name: "Land Condition Check", description: "Assess terrain, vegetation, debris, and general condition of undeveloped land", minTier: "community", proofTemplateId: ptStandard!.id, serviceTypeName: "Land Condition Report", sortOrder: 15 },
    { name: "Land Access Verification", description: "Verify road access, gate presence, and access road condition for land or rural property", minTier: "community", proofTemplateId: ptQuick3!.id, serviceTypeName: "Access Verification", sortOrder: 16 },
    { name: "Boundary Marker / Fence Check", description: "Locate and photograph fence lines, corner markers, and boundary indicators on land", minTier: "community", proofTemplateId: ptQuick3!.id, serviceTypeName: "Boundary Visual Check", sortOrder: 17 },
    { name: "Illegal Dumping / Encroachment Check", description: "Document trash dumping, abandoned vehicles, or neighbor encroachment on land or property", minTier: "community", proofTemplateId: ptQuick3!.id, serviceTypeName: "Dumping/Encroachment Report", sortOrder: 18 },
    { name: "Utility Proximity Check", description: "Photograph power poles, transformers, water meters, and nearby infrastructure for land assessment", minTier: "community", proofTemplateId: ptQuick3!.id, serviceTypeName: "Utility Proximity Report", sortOrder: 19 },
  ];

  for (const sit of newSituations) {
    if (existingNames.has(sit.name)) continue;
    const uc = await storage.createUseCase({ viCategoryId: catId, name: sit.name, description: sit.description, minTier: sit.minTier, sortOrder: sit.sortOrder });
    await storage.createCatalogServiceType({ useCaseId: uc.id, name: sit.serviceTypeName, description: sit.description, proofTemplateId: sit.proofTemplateId, minTier: sit.minTier, sortOrder: 1 });
    console.log(`[SEED] Added property situation: ${sit.name}`);
  }
}

export async function migrateGuberIds() {
  const allUsers = await db.select({ id: users.id, guberId: (users as any).guberId }).from(users);
  let count = 0;
  for (const u of allUsers) {
    if (!u.guberId) {
      let newId = generateGuberId();
      const existing = allUsers.filter(x => x.guberId === newId);
      while (existing.length > 0) { newId = generateGuberId(); }
      await db.execute(sql`UPDATE users SET guber_id = ${newId} WHERE id = ${u.id}`);
      count++;
    }
  }
  if (count > 0) console.log(`[GUBER] Generated GUBER IDs for ${count} existing user(s).`);
}

const REFERRAL_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genRefCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += REFERRAL_CHARSET[Math.floor(Math.random() * REFERRAL_CHARSET.length)];
  return code;
}

export async function seedReferralExpiry() {
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_discount_expires_at TIMESTAMPTZ`);
}

export async function seedServicePricingConfigs() {
  try {
    const configs = [
      { category: "On-Demand Help", serviceTypeName: "Pet Care", minPayout: 10, suggestedRangeLow: 15, suggestedRangeHigh: 35, estimatedMinutes: 30, complexityTier: "standard" },
      { category: "On-Demand Help", serviceTypeName: "Errand Running", minPayout: 8, suggestedRangeLow: 12, suggestedRangeHigh: 25, estimatedMinutes: 30, complexityTier: "basic" },
      { category: "On-Demand Help", serviceTypeName: "Delivery", minPayout: 8, suggestedRangeLow: 10, suggestedRangeHigh: 30, estimatedMinutes: 20, complexityTier: "basic" },
      { category: "On-Demand Help", serviceTypeName: "Personal Assistant", minPayout: 12, suggestedRangeLow: 15, suggestedRangeHigh: 40, estimatedMinutes: 60, complexityTier: "standard" },
      { category: "On-Demand Help", serviceTypeName: "Tutoring", minPayout: 15, suggestedRangeLow: 20, suggestedRangeHigh: 50, estimatedMinutes: 60, complexityTier: "advanced" },
      { category: "On-Demand Help", serviceTypeName: "Tech Support", minPayout: 15, suggestedRangeLow: 20, suggestedRangeHigh: 50, estimatedMinutes: 45, complexityTier: "advanced" },
      { category: "On-Demand Help", serviceTypeName: "Event Help", minPayout: 15, suggestedRangeLow: 20, suggestedRangeHigh: 60, estimatedMinutes: 120, complexityTier: "standard" },
      { category: "On-Demand Help", serviceTypeName: "House Sitting", minPayout: 20, suggestedRangeLow: 25, suggestedRangeHigh: 75, estimatedMinutes: 240, complexityTier: "standard" },

      { category: "General Labor", serviceTypeName: "Moving", minPayout: 25, suggestedRangeLow: 40, suggestedRangeHigh: 150, estimatedMinutes: 120, complexityTier: "standard" },
      { category: "General Labor", serviceTypeName: "Lawn Care", minPayout: 15, suggestedRangeLow: 25, suggestedRangeHigh: 60, estimatedMinutes: 60, complexityTier: "basic" },
      { category: "General Labor", serviceTypeName: "Cleaning", minPayout: 15, suggestedRangeLow: 20, suggestedRangeHigh: 60, estimatedMinutes: 90, complexityTier: "basic" },
      { category: "General Labor", serviceTypeName: "Hauling", minPayout: 20, suggestedRangeLow: 30, suggestedRangeHigh: 100, estimatedMinutes: 60, complexityTier: "standard" },
      { category: "General Labor", serviceTypeName: "Assembly", minPayout: 15, suggestedRangeLow: 25, suggestedRangeHigh: 75, estimatedMinutes: 60, complexityTier: "standard" },
      { category: "General Labor", serviceTypeName: "Demolition", minPayout: 25, suggestedRangeLow: 40, suggestedRangeHigh: 120, estimatedMinutes: 120, complexityTier: "advanced" },
      { category: "General Labor", serviceTypeName: "Pressure Washing", minPayout: 20, suggestedRangeLow: 30, suggestedRangeHigh: 100, estimatedMinutes: 90, complexityTier: "standard" },
      { category: "General Labor", serviceTypeName: "Junk Removal", minPayout: 20, suggestedRangeLow: 30, suggestedRangeHigh: 100, estimatedMinutes: 60, complexityTier: "standard" },

      { category: "Skilled Labor", serviceTypeName: "Plumbing", minPayout: 40, suggestedRangeLow: 50, suggestedRangeHigh: 200, estimatedMinutes: 90, complexityTier: "expert" },
      { category: "Skilled Labor", serviceTypeName: "Electrical", minPayout: 40, suggestedRangeLow: 50, suggestedRangeHigh: 200, estimatedMinutes: 90, complexityTier: "expert" },
      { category: "Skilled Labor", serviceTypeName: "HVAC", minPayout: 50, suggestedRangeLow: 60, suggestedRangeHigh: 250, estimatedMinutes: 120, complexityTier: "expert" },
      { category: "Skilled Labor", serviceTypeName: "Carpentry", minPayout: 30, suggestedRangeLow: 40, suggestedRangeHigh: 150, estimatedMinutes: 90, complexityTier: "advanced" },
      { category: "Skilled Labor", serviceTypeName: "Drywall", minPayout: 25, suggestedRangeLow: 35, suggestedRangeHigh: 120, estimatedMinutes: 90, complexityTier: "advanced" },
      { category: "Skilled Labor", serviceTypeName: "Painting", minPayout: 25, suggestedRangeLow: 30, suggestedRangeHigh: 120, estimatedMinutes: 120, complexityTier: "standard" },
      { category: "Skilled Labor", serviceTypeName: "Welding", minPayout: 40, suggestedRangeLow: 50, suggestedRangeHigh: 200, estimatedMinutes: 60, complexityTier: "expert" },
      { category: "Skilled Labor", serviceTypeName: "Auto Repair", minPayout: 35, suggestedRangeLow: 45, suggestedRangeHigh: 200, estimatedMinutes: 120, complexityTier: "expert" },
      { category: "Skilled Labor", serviceTypeName: "Roofing", minPayout: 40, suggestedRangeLow: 50, suggestedRangeHigh: 250, estimatedMinutes: 180, complexityTier: "expert" },
      { category: "Skilled Labor", serviceTypeName: "Flooring", minPayout: 30, suggestedRangeLow: 40, suggestedRangeHigh: 150, estimatedMinutes: 120, complexityTier: "advanced" },

      // Task #319: vehicle / boat / RV / automotive additions
      { category: "On-Demand Help", serviceTypeName: "Jump Start", minPayout: 15, suggestedRangeLow: 20, suggestedRangeHigh: 60, estimatedMinutes: 30, complexityTier: "standard" },
      { category: "On-Demand Help", serviceTypeName: "Lockout Service", minPayout: 20, suggestedRangeLow: 25, suggestedRangeHigh: 75, estimatedMinutes: 30, complexityTier: "standard" },
      { category: "On-Demand Help", serviceTypeName: "Vehicle Transport", minPayout: 30, suggestedRangeLow: 45, suggestedRangeHigh: 200, estimatedMinutes: 60, complexityTier: "advanced" },
      { category: "On-Demand Help", serviceTypeName: "Roadside Assistance", minPayout: 20, suggestedRangeLow: 25, suggestedRangeHigh: 90, estimatedMinutes: 30, complexityTier: "standard" },
      { category: "General Labor", serviceTypeName: "Vehicle Detailing", minPayout: 25, suggestedRangeLow: 35, suggestedRangeHigh: 100, estimatedMinutes: 90, complexityTier: "standard" },
      { category: "General Labor", serviceTypeName: "Boat Cleaning", minPayout: 30, suggestedRangeLow: 45, suggestedRangeHigh: 140, estimatedMinutes: 120, complexityTier: "standard" },
      { category: "General Labor", serviceTypeName: "RV Cleaning", minPayout: 30, suggestedRangeLow: 50, suggestedRangeHigh: 150, estimatedMinutes: 120, complexityTier: "standard" },
      { category: "Skilled Labor", serviceTypeName: "Marine / Boat Repair", minPayout: 50, suggestedRangeLow: 65, suggestedRangeHigh: 300, estimatedMinutes: 120, complexityTier: "expert" },
      { category: "Skilled Labor", serviceTypeName: "Towing / Hauling", minPayout: 50, suggestedRangeLow: 65, suggestedRangeHigh: 300, estimatedMinutes: 60, complexityTier: "advanced" },

      { category: "Verify & Inspect", serviceTypeName: "Cleanliness + Damage Sweep", minPayout: 15, suggestedRangeLow: 20, suggestedRangeHigh: 35, estimatedMinutes: 20, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Supply/Restock Confirmation", minPayout: 10, suggestedRangeLow: 14, suggestedRangeHigh: 25, estimatedMinutes: 15, complexityTier: "basic" },
      { category: "Verify & Inspect", serviceTypeName: "Lockbox/Entry Check", minPayout: 8, suggestedRangeLow: 10, suggestedRangeHigh: 18, estimatedMinutes: 10, complexityTier: "basic" },
      { category: "Verify & Inspect", serviceTypeName: "Photo Set Only", minPayout: 12, suggestedRangeLow: 15, suggestedRangeHigh: 30, estimatedMinutes: 20, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Ready for Guest Proof Package", minPayout: 20, suggestedRangeLow: 25, suggestedRangeHigh: 50, estimatedMinutes: 30, complexityTier: "advanced" },
      { category: "Verify & Inspect", serviceTypeName: "Full Condition Photo Set", minPayout: 20, suggestedRangeLow: 25, suggestedRangeHigh: 50, estimatedMinutes: 30, complexityTier: "advanced" },
      { category: "Verify & Inspect", serviceTypeName: "Damage Focus Report", minPayout: 15, suggestedRangeLow: 20, suggestedRangeHigh: 40, estimatedMinutes: 25, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Appliance Condition Check", minPayout: 12, suggestedRangeLow: 15, suggestedRangeHigh: 30, estimatedMinutes: 20, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Trash/Personal Items Left Behind", minPayout: 10, suggestedRangeLow: 14, suggestedRangeHigh: 25, estimatedMinutes: 15, complexityTier: "basic" },
      { category: "Verify & Inspect", serviceTypeName: "Deposit Defense Proof Package", minPayout: 22, suggestedRangeLow: 28, suggestedRangeHigh: 55, estimatedMinutes: 35, complexityTier: "advanced" },
      { category: "Verify & Inspect", serviceTypeName: "Room-by-Room Baseline", minPayout: 15, suggestedRangeLow: 18, suggestedRangeHigh: 35, estimatedMinutes: 25, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Existing Damage Inventory", minPayout: 15, suggestedRangeLow: 18, suggestedRangeHigh: 35, estimatedMinutes: 25, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Key Areas Baseline", minPayout: 12, suggestedRangeLow: 15, suggestedRangeHigh: 30, estimatedMinutes: 20, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Entryway + Main Rooms + Exterior", minPayout: 12, suggestedRangeLow: 15, suggestedRangeHigh: 30, estimatedMinutes: 20, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Safety Items Visual Check", minPayout: 10, suggestedRangeLow: 12, suggestedRangeHigh: 22, estimatedMinutes: 15, complexityTier: "basic" },
      { category: "Verify & Inspect", serviceTypeName: "Occupancy Visual Confirmation", minPayout: 7, suggestedRangeLow: 10, suggestedRangeHigh: 18, estimatedMinutes: 10, complexityTier: "basic" },
      { category: "Verify & Inspect", serviceTypeName: "Exterior Photo Set", minPayout: 7, suggestedRangeLow: 10, suggestedRangeHigh: 20, estimatedMinutes: 10, complexityTier: "basic" },
      { category: "Verify & Inspect", serviceTypeName: "Drive-By Visual Report", minPayout: 7, suggestedRangeLow: 10, suggestedRangeHigh: 18, estimatedMinutes: 10, complexityTier: "basic" },
      { category: "Verify & Inspect", serviceTypeName: "Fixtures Visual Check", minPayout: 12, suggestedRangeLow: 15, suggestedRangeHigh: 28, estimatedMinutes: 20, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Basic Visual Pack (10 photos)", minPayout: 10, suggestedRangeLow: 14, suggestedRangeHigh: 25, estimatedMinutes: 15, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Standard Pack (25 photos + walkaround video)", minPayout: 20, suggestedRangeLow: 25, suggestedRangeHigh: 45, estimatedMinutes: 30, complexityTier: "advanced" },
      { category: "Verify & Inspect", serviceTypeName: "Auction Pack (VIN + odometer + damage focus)", minPayout: 18, suggestedRangeLow: 22, suggestedRangeHigh: 40, estimatedMinutes: 25, complexityTier: "advanced" },
      { category: "Verify & Inspect", serviceTypeName: "Title/VIN Tag Focus", minPayout: 8, suggestedRangeLow: 10, suggestedRangeHigh: 18, estimatedMinutes: 10, complexityTier: "basic" },
      { category: "Verify & Inspect", serviceTypeName: "Start Attempt Pack", minPayout: 15, suggestedRangeLow: 20, suggestedRangeHigh: 35, estimatedMinutes: 20, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Tire/Brake Visual Pack", minPayout: 10, suggestedRangeLow: 14, suggestedRangeHigh: 25, estimatedMinutes: 15, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Interior Condition Pack", minPayout: 10, suggestedRangeLow: 14, suggestedRangeHigh: 25, estimatedMinutes: 15, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Part Availability Confirmation", minPayout: 10, suggestedRangeLow: 12, suggestedRangeHigh: 22, estimatedMinutes: 20, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Is It Real + Is It There Pack", minPayout: 10, suggestedRangeLow: 14, suggestedRangeHigh: 28, estimatedMinutes: 20, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Condition Closeups + Tags Pack", minPayout: 10, suggestedRangeLow: 14, suggestedRangeHigh: 28, estimatedMinutes: 20, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Power-On + Screen + Ports Pack", minPayout: 12, suggestedRangeLow: 16, suggestedRangeHigh: 30, estimatedMinutes: 20, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Included Accessories Proof Pack", minPayout: 10, suggestedRangeLow: 14, suggestedRangeHigh: 25, estimatedMinutes: 15, complexityTier: "basic" },
      { category: "Verify & Inspect", serviceTypeName: "1 Photo Proof", minPayout: 5, suggestedRangeLow: 5, suggestedRangeHigh: 10, estimatedMinutes: 5, complexityTier: "basic" },
      { category: "Verify & Inspect", serviceTypeName: "3 Photo Proof", minPayout: 5, suggestedRangeLow: 7, suggestedRangeHigh: 12, estimatedMinutes: 5, complexityTier: "basic" },
      { category: "Verify & Inspect", serviceTypeName: "30s Video Proof", minPayout: 5, suggestedRangeLow: 7, suggestedRangeHigh: 14, estimatedMinutes: 5, complexityTier: "basic" },
      { category: "Verify & Inspect", serviceTypeName: "Photo + Timestamp Proof", minPayout: 5, suggestedRangeLow: 6, suggestedRangeHigh: 12, estimatedMinutes: 5, complexityTier: "basic" },
      { category: "Verify & Inspect", serviceTypeName: "Part/Item at Specific Spot", minPayout: 8, suggestedRangeLow: 10, suggestedRangeHigh: 18, estimatedMinutes: 15, complexityTier: "basic" },
      { category: "Verify & Inspect", serviceTypeName: "Search Entire Location for Part", minPayout: 15, suggestedRangeLow: 18, suggestedRangeHigh: 30, estimatedMinutes: 30, complexityTier: "standard" },
      { category: "Verify & Inspect", serviceTypeName: "Multi-Location Search (Radius)", minPayout: 25, suggestedRangeLow: 28, suggestedRangeHigh: 45, estimatedMinutes: 60, complexityTier: "advanced" },
      { category: "Verify & Inspect", serviceTypeName: "Unconfirmed Lead Verification", minPayout: 12, suggestedRangeLow: 15, suggestedRangeHigh: 30, estimatedMinutes: 25, complexityTier: "standard" },

      { category: "Marketplace", serviceTypeName: "Buy/Sell", minPayout: 5, suggestedRangeLow: 5, suggestedRangeHigh: 500, estimatedMinutes: 10, complexityTier: "basic" },
      { category: "Marketplace", serviceTypeName: "Rent", minPayout: 5, suggestedRangeLow: 10, suggestedRangeHigh: 200, estimatedMinutes: 10, complexityTier: "basic" },
      { category: "Marketplace", serviceTypeName: "Free Items", minPayout: 0, suggestedRangeLow: 0, suggestedRangeHigh: 0, estimatedMinutes: 10, complexityTier: "basic" },
    ];

    let inserted = 0;
    for (const c of configs) {
      const existing = await db.select().from(servicePricingConfig)
        .where(sql`${servicePricingConfig.category} = ${c.category} AND ${servicePricingConfig.serviceTypeName} = ${c.serviceTypeName}`)
        .limit(1);
      if (existing.length === 0) {
        await db.insert(servicePricingConfig).values(c);
        inserted++;
      }
    }

    if (inserted > 0) {
      console.log(`[GUBER] Seeded ${inserted} new service pricing configs (${configs.length} total defined).`);
    } else {
      console.log("[GUBER] Service pricing configs already seeded.");
    }
  } catch (e) {
    console.error("[GUBER] seedServicePricingConfigs error:", e);
  }
}

export async function seedDroneServices() {
  try {
    const cat = await db.select().from(viCategories).where(eq(viCategories.name, "Property & Site Check"));
    if (!cat.length) return;
    const catId = cat[0].id;

    const existing = await db.select().from(useCases).where(eq(useCases.viCategoryId, catId));
    const existingNames = new Set(existing.map(u => u.name));
    if (existingNames.has("Drone Services") || existingNames.has("Drone Aerial Inspection")) {
      console.log("[GUBER] Drone services already seeded.");
      return;
    }

    const templates = await db.select().from(proofTemplates);
    const ptPropertyFull = templates.find(t => t.name === "Property Full Package");
    const ptProperty = templates.find(t => t.name === "Property Standard");

    if (!ptPropertyFull || !ptProperty) {
      console.log("[GUBER] Proof templates not found for drone services, skipping.");
      return;
    }

    const ptDrone = await storage.createProofTemplate({
      name: "Drone Aerial Package",
      requiredPhotoCount: 10,
      requiredVideo: true,
      videoDuration: "1min",
      geoRequired: true,
      minDistanceRadius: 500,
      allowGalleryUpload: false,
      notEncounteredReasons: ["Airspace restricted", "Weather conditions unsafe", "Property not accessible", "GPS signal issues", "Address incorrect", "Other"],
    });

    await storage.createProofChecklistItem({ templateId: ptDrone.id, label: "Aerial overview", instruction: "Wide-angle aerial photo showing full property boundaries", mediaType: "photo", quantityRequired: 2, geoRequired: true, sortOrder: 1 });
    await storage.createProofChecklistItem({ templateId: ptDrone.id, label: "Roof/top-down view", instruction: "Directly overhead shot of roof or structure", mediaType: "photo", quantityRequired: 2, geoRequired: true, sortOrder: 2 });
    await storage.createProofChecklistItem({ templateId: ptDrone.id, label: "Four-corner angles", instruction: "Photos from each corner/side at 45-degree angle", mediaType: "photo", quantityRequired: 4, geoRequired: false, sortOrder: 3 });
    await storage.createProofChecklistItem({ templateId: ptDrone.id, label: "Detail/focus areas", instruction: "Close-up aerial shots of areas of concern", mediaType: "photo", quantityRequired: 2, geoRequired: false, sortOrder: 4 });
    await storage.createProofChecklistItem({ templateId: ptDrone.id, label: "Flyover video", instruction: "1-minute aerial flyover video of the property", mediaType: "video", quantityRequired: 1, geoRequired: true, sortOrder: 5 });
    await storage.createProofChecklistItem({ templateId: ptDrone.id, label: "Altitude & position note", instruction: "Include a text note or screenshot confirming approximate flight altitude and GPS position during capture", mediaType: "photo", quantityRequired: 1, geoRequired: true, sortOrder: 6 });

    const ucDrone = await storage.createUseCase({
      viCategoryId: catId,
      name: "Drone Services",
      description: "Aerial property inspection using drone — roof, land, exterior, and site overview",
      minTier: "verified",
      sortOrder: 20,
    });

    const droneServices = [
      { name: "Aerial Property Overview", description: "Wide-angle aerial photos and video showing full property, boundaries, and surrounding area", proofTemplateId: ptDrone.id, minTier: "verified", titleTemplate: "Drone - Aerial Property Overview", descriptionTemplate: "Complete aerial overview of property including boundary identification, lot shape, and surrounding context via drone.", sortOrder: 1 },
      { name: "Roof Inspection (Drone)", description: "Aerial close-up inspection of roof condition, damage, and wear from above", proofTemplateId: ptDrone.id, minTier: "verified", titleTemplate: "Drone - Roof Inspection", descriptionTemplate: "Drone-based roof condition inspection with close-up and overhead photos documenting damage, wear, and overall condition.", sortOrder: 2 },
      { name: "Aerial Land Survey", description: "Drone survey of undeveloped land showing terrain, vegetation, access roads, and boundaries", proofTemplateId: ptDrone.id, minTier: "verified", titleTemplate: "Drone - Aerial Land Survey", descriptionTemplate: "Aerial drone survey of land parcel showing terrain features, vegetation, access points, and approximate boundary lines.", sortOrder: 3 },
      { name: "Commercial Exterior (Drone)", description: "Aerial documentation of commercial building exterior, parking, signage, and site condition", proofTemplateId: ptDrone.id, minTier: "verified", titleTemplate: "Drone - Commercial Exterior", descriptionTemplate: "Drone-based documentation of commercial property exterior including building condition, parking lot, signage, and overall site layout.", sortOrder: 4 },
      { name: "Marina / Dock Aerial Check", description: "Aerial inspection of marina, dock, or waterfront property from above", proofTemplateId: ptDrone.id, minTier: "verified", titleTemplate: "Drone - Marina/Dock Aerial Check", descriptionTemplate: "Aerial drone documentation of marina, dock area, or waterfront property condition from multiple angles and altitudes.", sortOrder: 5 },
    ];

    for (const svc of droneServices) {
      await storage.createCatalogServiceType({ useCaseId: ucDrone.id, ...svc });
    }

    const dronePricingConfigs = [
      { category: "Verify & Inspect", serviceTypeName: "Aerial Property Overview", minPayout: 25, suggestedRangeLow: 30, suggestedRangeHigh: 60, estimatedMinutes: 30, complexityTier: "advanced" },
      { category: "Verify & Inspect", serviceTypeName: "Roof Inspection (Drone)", minPayout: 35, suggestedRangeLow: 40, suggestedRangeHigh: 75, estimatedMinutes: 35, complexityTier: "advanced" },
      { category: "Verify & Inspect", serviceTypeName: "Aerial Land Survey", minPayout: 30, suggestedRangeLow: 35, suggestedRangeHigh: 70, estimatedMinutes: 40, complexityTier: "advanced" },
      { category: "Verify & Inspect", serviceTypeName: "Commercial Exterior (Drone)", minPayout: 35, suggestedRangeLow: 40, suggestedRangeHigh: 75, estimatedMinutes: 45, complexityTier: "advanced" },
      { category: "Verify & Inspect", serviceTypeName: "Marina / Dock Aerial Check", minPayout: 35, suggestedRangeLow: 40, suggestedRangeHigh: 75, estimatedMinutes: 40, complexityTier: "advanced" },
    ];

    for (const c of dronePricingConfigs) {
      const existing = await db.select().from(servicePricingConfig)
        .where(sql`${servicePricingConfig.category} = ${c.category} AND ${servicePricingConfig.serviceTypeName} = ${c.serviceTypeName}`)
        .limit(1);
      if (existing.length === 0) {
        await db.insert(servicePricingConfig).values(c);
      }
    }

    console.log("[GUBER] Drone aerial inspection services seeded.");
  } catch (e) {
    console.error("[GUBER] seedDroneServices error:", e);
  }
}

export async function seedAutomotiveVIUseCases() {
  try {
    const cat = await db.select().from(viCategories).where(eq(viCategories.name, "Wheels, Wings & Water"));
    if (!cat.length) return;
    const catId = cat[0].id;

    const existing = await db.select().from(useCases).where(eq(useCases.viCategoryId, catId));
    const existingNames = new Set(existing.map(u => u.name));
    if (existingNames.has("Boat Check") && existingNames.has("RV Check")) {
      console.log("[GUBER] Automotive V&I use cases already seeded.");
      return;
    }

    const templates = await db.select().from(proofTemplates);
    const ptVehicleStandard = templates.find(t => t.name === "Vehicle Standard");
    const ptVehicleBasic = templates.find(t => t.name === "Vehicle Basic");
    if (!ptVehicleStandard || !ptVehicleBasic) {
      console.log("[GUBER] Vehicle proof templates not found, skipping automotive V&I use cases.");
      return;
    }

    const sharedPacks = [
      { name: "Basic Visual Pack (10 photos)", description: "10 photos covering all major angles and visible condition", proofTemplateId: ptVehicleBasic.id, minTier: "community", titleTemplate: "{useCase} - Basic Visual Pack", descriptionTemplate: "10-photo visual documentation covering all major angles and visible condition. Visual only — no diagnosis.", sortOrder: 1 },
      { name: "Standard Pack (25 photos + walkaround video)", description: "25 photos plus walkaround video for comprehensive documentation", proofTemplateId: ptVehicleStandard.id, minTier: "verified", titleTemplate: "{useCase} - Standard Pack", descriptionTemplate: "Comprehensive 25-photo pack with walkaround video showing all angles, interior, and any visible issues.", sortOrder: 2 },
    ];

    if (!existingNames.has("Boat Check")) {
      const ucBoatCheck = await storage.createUseCase({
        viCategoryId: catId,
        name: "Boat Check",
        description: "Visual verification of a boat — exterior, interior, hull, engine bay, and trailer condition. Visual only.",
        minTier: "verified",
        sortOrder: 9,
      });
      for (const st of sharedPacks) {
        await storage.createCatalogServiceType({ ...st, useCaseId: ucBoatCheck.id });
      }
      await storage.createCatalogServiceType({
        useCaseId: ucBoatCheck.id,
        name: "Hull / Engine Bay Focus",
        description: "Focused visual documentation of hull and engine compartment. Visual only — no marine survey.",
        proofTemplateId: ptVehicleStandard.id,
        minTier: "verified",
        titleTemplate: "Boat Check - Hull / Engine Bay Focus",
        descriptionTemplate: "Focused visual documentation of hull condition and engine compartment. Visual only — not a marine survey or mechanical inspection.",
        sortOrder: 3,
      });
    }

    if (!existingNames.has("RV Check")) {
      const ucRVCheck = await storage.createUseCase({
        viCategoryId: catId,
        name: "RV Check",
        description: "Visual verification of an RV / trailer — exterior, interior, roof, slide-outs, and tires. Visual only.",
        minTier: "verified",
        sortOrder: 10,
      });
      for (const st of sharedPacks) {
        await storage.createCatalogServiceType({ ...st, useCaseId: ucRVCheck.id });
      }
      await storage.createCatalogServiceType({
        useCaseId: ucRVCheck.id,
        name: "Roof / Slide-Out Focus",
        description: "Focused visual documentation of roof and slide-out condition. Visual only — no mechanical inspection.",
        proofTemplateId: ptVehicleStandard.id,
        minTier: "verified",
        titleTemplate: "RV Check - Roof / Slide-Out Focus",
        descriptionTemplate: "Focused visual documentation of roof condition and slide-out function (visual). No mechanical inspection or RV guarantee.",
        sortOrder: 3,
      });
    }

    console.log("[GUBER] Automotive V&I use cases (Boat Check, RV Check) seeded.");
  } catch (e) {
    console.error("[GUBER] seedAutomotiveVIUseCases error:", e);
  }
}

export async function seedBarterChecklists() {
  try {
    const barterChecklists = [
      { category: "Barter Labor", serviceTypeName: null as string | null, name: "barterOfferingDesc", label: "What are you offering?", fieldType: "text_input" as string, options: null as string[] | null, required: true, sortOrder: 3 },
      { category: "Barter Labor", serviceTypeName: null as string | null, name: "barterTimeEstimate", label: "Estimated time needed", fieldType: "single_select" as string, options: ["30 min", "1 hour", "1.5 hours", "2 hours", "3 hours", "4+ hours"], required: false, sortOrder: 4 },
    ];

    for (const item of barterChecklists) {
      const existing = await storage.getJobChecklists(item.category, item.serviceTypeName ?? undefined);
      const alreadyExists = existing.some(e => e.name === item.name);
      if (!alreadyExists) {
        await storage.createJobChecklist({
          category: item.category,
          serviceTypeName: item.serviceTypeName,
          name: item.name,
          label: item.label,
          fieldType: item.fieldType,
          options: item.options,
          required: item.required,
          sortOrder: item.sortOrder,
          useCaseId: null,
          viCategoryId: null,
        });
      }
    }
    console.log("[GUBER] Barter checklists seeded.");
  } catch (e) {
    console.error("[GUBER] seedBarterChecklists error:", e);
  }
}

export async function reseedOnlineItemsSituations() {
  try {
    const cats = await db.select().from(viCategories).where(eq(viCategories.name, "Online Items"));
    if (!cats.length) {
      console.log("[GUBER] Online Items category not found, skipping reseed.");
      return;
    }
    const cat3Id = cats[0].id;

    const existingOnlineUCs = await db.select().from(useCases).where(eq(useCases.viCategoryId, cat3Id));
    const expectedNames = ["Seller Location Check", "Item Exists Verification", "Condition Quick Check", "Serial / Model Tag Confirmation", "Electronics Power-On Proof"];
    const existingNames = existingOnlineUCs.map(uc => uc.name);
    const allPresent = expectedNames.every(name => existingNames.includes(name));
    if (allPresent && existingOnlineUCs.length === 5) {
      console.log("[GUBER] Online Items situations already reseeded.");
      return;
    }

    const oldUseCases = await db.select().from(useCases).where(eq(useCases.viCategoryId, cat3Id));
    const oldUseCaseIds = oldUseCases.map(uc => uc.id);

    if (oldUseCaseIds.length > 0) {
      await db.delete(catalogServiceTypes).where(inArray(catalogServiceTypes.useCaseId, oldUseCaseIds));
      await db.delete(useCases).where(inArray(useCases.id, oldUseCaseIds));
    }

    await db.delete(detailOptionSets).where(eq(detailOptionSets.viCategoryId, cat3Id));

    const oldPt = await db.select().from(proofTemplates).where(eq(proofTemplates.name, "Online Item Check"));
    if (oldPt.length > 0) {
      await db.delete(proofChecklistItems).where(eq(proofChecklistItems.templateId, oldPt[0].id));
      await db.delete(proofTemplates).where(eq(proofTemplates.id, oldPt[0].id));
    }

    const ptSellerLoc = await storage.createProofTemplate({
      name: "Seller Location Check",
      requiredPhotoCount: 3,
      requiredVideo: false,
      geoRequired: true,
      minDistanceRadius: 500,
      allowGalleryUpload: false,
      notEncounteredReasons: ["Address incorrect", "No one present", "Unsafe area", "Location does not exist", "Other"]
    });
    await storage.createProofChecklistItem({ templateId: ptSellerLoc.id, label: "Building/house/business photo", instruction: "Clear photo of the building or house at the seller's address", mediaType: "photo", quantityRequired: 1, geoRequired: true, sortOrder: 1 });
    await storage.createProofChecklistItem({ templateId: ptSellerLoc.id, label: "Street view photo", instruction: "Photo showing the street and surrounding area", mediaType: "photo", quantityRequired: 1, geoRequired: true, sortOrder: 2 });
    await storage.createProofChecklistItem({ templateId: ptSellerLoc.id, label: "Address number photo", instruction: "Photo of the visible address number (if visible)", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 3 });
    await storage.createProofChecklistItem({ templateId: ptSellerLoc.id, label: "Observation note", instruction: "Note: occupied / abandoned / empty lot / unclear", mediaType: "note", quantityRequired: 1, geoRequired: false, sortOrder: 4 });

    const ptItemExists = await storage.createProofTemplate({
      name: "Item Exists Verification",
      requiredPhotoCount: 2,
      requiredVideo: false,
      geoRequired: false,
      allowGalleryUpload: false,
      notEncounteredReasons: ["Item not found", "Seller not present", "Item already sold", "Address incorrect", "Other"]
    });
    await storage.createProofChecklistItem({ templateId: ptItemExists.id, label: "Photo of item", instruction: "Clear photo of the item matching the listing", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 1 });
    await storage.createProofChecklistItem({ templateId: ptItemExists.id, label: "Wide shot with item at location", instruction: "Photo showing item in its surroundings at the location", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 2 });
    await storage.createProofChecklistItem({ templateId: ptItemExists.id, label: "Presence note", instruction: "Note: seller present / item visible / item matches listing", mediaType: "note", quantityRequired: 1, geoRequired: false, sortOrder: 3 });

    const ptCondition = await storage.createProofTemplate({
      name: "Condition Quick Check",
      requiredPhotoCount: 4,
      requiredVideo: false,
      geoRequired: false,
      allowGalleryUpload: false,
      notEncounteredReasons: ["Item not available", "Seller refused inspection", "Item already sold", "Not as described", "Other"]
    });
    await storage.createProofChecklistItem({ templateId: ptCondition.id, label: "Overview photos", instruction: "Full view of item from multiple angles", mediaType: "photo", quantityRequired: 2, geoRequired: false, sortOrder: 1 });
    await storage.createProofChecklistItem({ templateId: ptCondition.id, label: "Closeup photos of wear/damage/flaws", instruction: "Close-up photos showing any wear, damage, or flaws", mediaType: "photo", quantityRequired: 2, geoRequired: false, sortOrder: 2 });
    await storage.createProofChecklistItem({ templateId: ptCondition.id, label: "Condition note", instruction: "Note: good / fair / poor / visible damage / unclear", mediaType: "note", quantityRequired: 1, geoRequired: false, sortOrder: 3 });

    const ptSerial = await storage.createProofTemplate({
      name: "Serial/Model Tag Confirmation",
      requiredPhotoCount: 2,
      requiredVideo: false,
      geoRequired: false,
      allowGalleryUpload: false,
      notEncounteredReasons: ["Tag not visible", "Tag removed", "Seller refused", "Item not available", "Other"]
    });
    await storage.createProofChecklistItem({ templateId: ptSerial.id, label: "Item overview photo", instruction: "Full view of the item for identification", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 1 });
    await storage.createProofChecklistItem({ templateId: ptSerial.id, label: "Serial tag / model label photo", instruction: "Clear close-up of serial number or model label", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 2 });
    await storage.createProofChecklistItem({ templateId: ptSerial.id, label: "Matching note", instruction: "Note if serial/model matches the listing (optional)", mediaType: "note", quantityRequired: 1, geoRequired: false, sortOrder: 3 });

    const ptPowerOn = await storage.createProofTemplate({
      name: "Electronics Power-On Proof",
      requiredPhotoCount: 4,
      requiredVideo: false,
      geoRequired: false,
      allowGalleryUpload: false,
      notEncounteredReasons: ["Device won't power on", "No charger available", "Seller refused", "Item not available", "Other"]
    });
    await storage.createProofChecklistItem({ templateId: ptPowerOn.id, label: "Device overview photo", instruction: "Full view of the electronic device", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 1 });
    await storage.createProofChecklistItem({ templateId: ptPowerOn.id, label: "Powered-on screen photo", instruction: "Photo showing the device powered on with screen lit", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 2 });
    await storage.createProofChecklistItem({ templateId: ptPowerOn.id, label: "Ports/connections photo", instruction: "Photo of ports and connections (if relevant)", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 3 });
    await storage.createProofChecklistItem({ templateId: ptPowerOn.id, label: "Serial/model tag photo", instruction: "Photo of serial or model tag (if visible)", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 4 });

    const situations = [
      { name: "Seller Location Check", description: "Verify the seller's address is real and occupied before you commit to a meetup or drive", minTier: "community", sortOrder: 1, ptId: ptSellerLoc.id },
      { name: "Item Exists Verification", description: "Confirm the item from the listing actually exists at the seller's location", minTier: "community", sortOrder: 2, ptId: ptItemExists.id },
      { name: "Condition Quick Check", description: "Get close-up photos of wear, damage, and flaws before committing to buy", minTier: "community", sortOrder: 3, ptId: ptCondition.id },
      { name: "Serial / Model Tag Confirmation", description: "Verify the serial number or model label matches what the seller claims", minTier: "community", sortOrder: 4, ptId: ptSerial.id },
      { name: "Electronics Power-On Proof", description: "Confirm an electronic device actually powers on and the screen works", minTier: "community", sortOrder: 5, ptId: ptPowerOn.id },
    ];

    for (const sit of situations) {
      const uc = await storage.createUseCase({
        viCategoryId: cat3Id,
        name: sit.name,
        description: sit.description,
        minTier: sit.minTier,
        sortOrder: sit.sortOrder,
      });

      await storage.createCatalogServiceType({
        useCaseId: uc.id,
        name: "Online Item",
        description: sit.description,
        proofTemplateId: sit.ptId,
        minTier: sit.minTier,
        titleTemplate: `${sit.name} — Online Item`,
        descriptionTemplate: sit.description,
        sortOrder: 1,
      });
    }

    const newDetails = [
      { viCategoryId: cat3Id, name: "itemCategory", label: "Item Category", fieldType: "single_select", options: ["Electronics", "Furniture", "Tools", "Appliances", "Collectibles", "Outdoor Equipment", "Other"], sortOrder: 1, required: false },
      { viCategoryId: cat3Id, name: "onlinePlatform", label: "Online Platform", fieldType: "single_select", options: ["Facebook Marketplace", "Craigslist", "OfferUp", "eBay", "Mercari", "Other"], sortOrder: 2, required: false },
    ];

    for (const d of newDetails) {
      await storage.createDetailOptionSet(d);
    }

    console.log("[GUBER] Online Items situations reseeded with 5 buyer-intent situations.");
  } catch (e) {
    console.error("[GUBER] reseedOnlineItemsSituations error:", e);
  }
}

export async function seedUploadQuotaColumns() {
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_image_uploads INTEGER DEFAULT 0`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_video_uploads INTEGER DEFAULT 0`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS upload_month_year TEXT`);
}

export async function seedDisputeProtectionColumns() {
  // ── jobs: dispute & payout-protection fields (Task #317) ───────────
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispute_issue_type TEXT`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispute_evidence_urls TEXT[]`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispute_opened_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pre_dispute_status TEXT`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS helper_response TEXT`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS helper_response_evidence_urls TEXT[]`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS helper_response_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS helper_response_deadline TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS admin_decision TEXT`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS admin_decision_notes TEXT`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS admin_reviewed_by INTEGER`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS payout_amount REAL`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS partial_refund_amount REAL`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS safety_confirmed_by_poster BOOLEAN DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS safety_confirmed_by_helper BOOLEAN DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS internal_payout_status TEXT`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS geofence_verified_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS contact_bypass_flagged BOOLEAN DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_quality_score INTEGER`);

  // ── guber_disputes: audit-mirror fields ────────────────────────────
  await db.execute(sql`ALTER TABLE guber_disputes ADD COLUMN IF NOT EXISTS issue_type TEXT`);
  await db.execute(sql`ALTER TABLE guber_disputes ADD COLUMN IF NOT EXISTS evidence_urls TEXT[]`);
  await db.execute(sql`ALTER TABLE guber_disputes ADD COLUMN IF NOT EXISTS helper_response TEXT`);
  await db.execute(sql`ALTER TABLE guber_disputes ADD COLUMN IF NOT EXISTS helper_response_evidence_urls TEXT[]`);
  await db.execute(sql`ALTER TABLE guber_disputes ADD COLUMN IF NOT EXISTS helper_response_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE guber_disputes ADD COLUMN IF NOT EXISTS helper_response_deadline TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE guber_disputes ADD COLUMN IF NOT EXISTS admin_decision TEXT`);
  await db.execute(sql`ALTER TABLE guber_disputes ADD COLUMN IF NOT EXISTS admin_decision_notes TEXT`);
  await db.execute(sql`ALTER TABLE guber_disputes ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE guber_disputes ADD COLUMN IF NOT EXISTS admin_reviewed_by INTEGER`);

  // ── users: risk level & signal counters ────────────────────────────
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'normal'`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS no_show_count INTEGER DEFAULT 0`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS missing_proof_count INTEGER DEFAULT 0`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS bypass_attempt_count INTEGER DEFAULT 0`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS false_claim_flag_count INTEGER DEFAULT 0`);
}

export async function seedBoostColumns() {
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS boost_suggested BOOLEAN DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS suggested_budget REAL`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_boosted BOOLEAN DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS boosted_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS barter_need TEXT`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS barter_offering TEXT`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS barter_estimated_value TEXT`);
}

export async function seedReferralCodes() {
  const allUsers = await db.execute(sql`SELECT id FROM users WHERE referral_code IS NULL`);
  const rows = allUsers.rows as { id: number }[];
  if (!rows.length) return;
  let count = 0;
  for (const u of rows) {
    let code = genRefCode();
    let attempts = 0;
    while (attempts < 20) {
      const existing = await db.execute(sql`SELECT 1 FROM users WHERE referral_code = ${code} LIMIT 1`);
      if (!existing.rows.length) break;
      code = genRefCode();
      attempts++;
    }
    await db.execute(sql`UPDATE users SET referral_code = ${code} WHERE id = ${u.id}`);
    count++;
  }
  if (count > 0) console.log(`[GUBER] Generated referral codes for ${count} existing user(s).`);
}

const PLATFORM_SETTINGS_DEFAULTS: { key: string; value: string; category: string; description: string }[] = [
  { key: "platform_fee_rate", value: "0.20", category: "marketplace", description: "Platform fee rate (default 20%)" },
  { key: "poster_processing_fee_rate", value: "0.032", category: "marketplace", description: "Poster processing fee rate (Stripe 2.9% + 30c approximation)" },
  { key: "poster_service_fee_rate", value: "0", category: "marketplace", description: "Optional poster service fee rate (0 = disabled)" },
  { key: "early_cashout_fee_rate", value: "0.02", category: "marketplace", description: "Early cash-out fee rate (2%)" },
  { key: "instant_cashout_fee_rate", value: "0.05", category: "marketplace", description: "Instant cash-out fee rate (5%)" },
  { key: "review_timer_hours", value: "12", category: "marketplace", description: "Hours before auto-confirming completed jobs" },
  { key: "auto_confirm_enabled", value: "true", category: "marketplace", description: "Auto-confirm jobs after review timer expires" },
  { key: "auto_payout_enabled", value: "false", category: "marketplace", description: "Auto-trigger standard payout when eligible" },
  { key: "early_cashout_enabled", value: "false", category: "marketplace", description: "Allow workers to use early cash-out" },
  { key: "instant_cashout_enabled", value: "false", category: "marketplace", description: "Allow workers to use instant cash-out" },
  { key: "trust_new_worker_max", value: "59", category: "trust", description: "Trust score upper bound for New Worker level" },
  { key: "trust_verified_worker_max", value: "79", category: "trust", description: "Trust score upper bound for Verified Worker level" },
  { key: "trust_og_starting_bonus", value: "10", category: "trust", description: "Day-1 OG starting trust score bonus" },
  { key: "cash_drop_enabled", value: "true", category: "cash_drop", description: "Cash Drop feature enabled" },
  { key: "cash_drop_credit_bonus", value: "1.2", category: "cash_drop", description: "Multiplier for GUBER Credit option (1.2 = 20% bonus)" },
  { key: "cash_drop_payout_methods", value: "cash_app,venmo,paypal,ach,guber_credit", category: "cash_drop", description: "Enabled payout methods for Cash Drops" },
  { key: "cash_drop_manual_approval", value: "true", category: "cash_drop", description: "Require manual admin approval for Cash Drop claims" },
  { key: "cash_drop_claim_expiry_hours", value: "48", category: "cash_drop", description: "Hours before a claim expires" },
  { key: "cash_drop_max_reward", value: "500", category: "cash_drop", description: "Maximum reward amount per Cash Drop" },
];

export async function seedPlatformSettings() {
  let inserted = 0;
  for (const setting of PLATFORM_SETTINGS_DEFAULTS) {
    const existing = await db.select().from(platformSettings).where(eq(platformSettings.key, setting.key)).limit(1);
    if (existing.length === 0) {
      await db.insert(platformSettings).values(setting);
      inserted++;
    }
  }
  if (inserted > 0) {
    console.log(`[GUBER] Seeded ${inserted} platform settings.`);
  } else {
    console.log("[GUBER] Platform settings already seeded.");
  }
}

export async function seedLiabilityColumns() {
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS liability_disclaimer_accepted_at TIMESTAMPTZ`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS helper_safety_confirmed_at TIMESTAMPTZ`);
}

export async function seedDroneCategory() {
  try {
    const existing = await db.select().from(viCategories).where(eq(viCategories.name, "Drone / Aerial Footage"));
    if (existing.length > 0) {
      console.log("[GUBER] Drone / Aerial Footage category already seeded.");
      return;
    }

    const ptDroneAerial = await storage.createProofTemplate({
      name: "Drone Aerial Footage Package",
      requiredPhotoCount: 9,
      requiredVideo: true,
      videoDuration: "1min",
      geoRequired: true,
      minDistanceRadius: 500,
      allowGalleryUpload: false,
      notEncounteredReasons: [
        "Airspace restricted (NOTAM / TFR in effect)",
        "Weather conditions unsafe for flight",
        "Location not accessible / private property denial",
        "GPS/signal issues preventing safe operation",
        "FAA waiver required — not obtained",
        "Address incorrect",
        "Other",
      ],
    });

    await storage.createProofChecklistItem({ templateId: ptDroneAerial.id, label: "GPS-stamped aerial video", instruction: "Record a minimum 1-minute flyover video with GPS metadata confirming capture location", mediaType: "video", quantityRequired: 1, geoRequired: true, sortOrder: 1 });
    await storage.createProofChecklistItem({ templateId: ptDroneAerial.id, label: "Wide aerial stills — overview", instruction: "2 wide-angle overhead photos showing the full area / subject from altitude", mediaType: "photo", quantityRequired: 2, geoRequired: true, sortOrder: 2 });
    await storage.createProofChecklistItem({ templateId: ptDroneAerial.id, label: "Angled aerial stills — four sides", instruction: "One 45-degree angled photo from each cardinal direction", mediaType: "photo", quantityRequired: 4, geoRequired: false, sortOrder: 3 });
    await storage.createProofChecklistItem({ templateId: ptDroneAerial.id, label: "Detail / focus shots", instruction: "Close-up aerial photos of the specific area or feature requested", mediaType: "photo", quantityRequired: 2, geoRequired: false, sortOrder: 4 });
    await storage.createProofChecklistItem({ templateId: ptDroneAerial.id, label: "FAA compliance note", instruction: "Photograph your Part 107 certificate or attach a text note confirming legal airspace authorization (Class G / waiver number / B4UFLY clearance)", mediaType: "photo", quantityRequired: 1, geoRequired: false, sortOrder: 5 });

    const catDrone = await storage.createVICategory({
      name: "Drone / Aerial Footage",
      description: "FAA-compliant aerial drone footage for real estate, insurance, construction, and events",
      icon: "plane",
      sortOrder: 6,
    });

    const ucRealEstate = await storage.createUseCase({ viCategoryId: catDrone.id, name: "Real Estate Listing Shots", description: "Aerial photos and video for residential or commercial property listings", minTier: "verified", sortOrder: 1 });
    const ucInsurance = await storage.createUseCase({ viCategoryId: catDrone.id, name: "Insurance Damage Assessment", description: "Aerial documentation of storm, fire, or structural damage for insurance claims", minTier: "verified", sortOrder: 2 });
    const ucConstruction = await storage.createUseCase({ viCategoryId: catDrone.id, name: "Construction Progress", description: "Periodic aerial documentation of construction or renovation site progress", minTier: "verified", sortOrder: 3 });
    const ucEvent = await storage.createUseCase({ viCategoryId: catDrone.id, name: "Event Coverage (public/permitted areas only)", description: "Aerial footage of outdoor events in public or permitted airspace — no restricted venues", minTier: "verified", sortOrder: 4 });

    const droneServiceTypes = [
      { name: "Aerial Photo + Video Package", description: "Full package: GPS-stamped flyover video, wide stills, and angled detail shots. $50–$100 typical", proofTemplateId: ptDroneAerial.id, minTier: "verified", sortOrder: 1 },
      { name: "Photo Stills Only", description: "Wide overview and angled aerial stills without video. $30–$60 typical", proofTemplateId: ptDroneAerial.id, minTier: "verified", sortOrder: 2 },
      { name: "Video Flyover Only", description: "GPS-stamped video flyover of the subject area. $40–$75 typical", proofTemplateId: ptDroneAerial.id, minTier: "verified", sortOrder: 3 },
    ];

    for (const uc of [ucRealEstate, ucInsurance, ucConstruction, ucEvent]) {
      for (const svc of droneServiceTypes) {
        await storage.createCatalogServiceType({
          useCaseId: uc.id,
          name: svc.name,
          description: svc.description,
          proofTemplateId: svc.proofTemplateId,
          minTier: svc.minTier,
          titleTemplate: `Drone ${uc.name} — ${svc.name}`,
          descriptionTemplate: `FAA-compliant aerial drone ${svc.name.toLowerCase()} for ${uc.name.toLowerCase()}. Operator confirms legal airspace and Part 107 or recreational certification.`,
          sortOrder: svc.sortOrder,
        });
      }
    }

    console.log("[GUBER] Drone / Aerial Footage category seeded.");
  } catch (e) {
    console.error("[GUBER] seedDroneCategory error:", e);
  }
}

export async function seedMarketplaceSamples() {
  try {
    const { pool } = await import("./db");
    const existing = await pool.query("SELECT COUNT(*) FROM marketplace_items WHERE is_sample = true");
    if (parseInt(existing.rows[0].count) > 0) return;
    const adminRow = await pool.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1");
    const sellerRow = adminRow.rows[0] || (await pool.query("SELECT id FROM users ORDER BY id ASC LIMIT 1")).rows[0];
    if (!sellerRow) return;
    const sellerId = sellerRow.id;
    const sellerNameRow = await pool.query("SELECT full_name FROM users WHERE id = $1", [sellerId]);
    const sellerName = sellerNameRow.rows[0]?.full_name || "GUBER Sample";

    const now = new Date();
    const expires = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const samples = [
      {
        title: "2019 Honda Accord Sport – 82k Miles, Clean Title",
        category: "Vehicles", subCategory: "Car", listingType: "cash_sale", sellerType: "Private Seller",
        purchaseType: "cash_sale", brand: "Honda", model: "Accord", year: 2019,
        vehicleMileage: 82000, titleStatus: "Clean Title", condition: "Good",
        price: 14500, priceType: "firm", makeOfferEnabled: true, askingType: "obo",
        city: "Mobile", state: "AL", zipcode: "36601", locationApprox: "Mobile, AL",
        description: "One owner, well maintained. No accidents. New tires 10k ago. Honda service records available.",
        details: { transmission: "CVT", fuelType: "Gasoline", exteriorColor: "Sonic Gray Pearl", conditionFlags: ["Runs & Drives", "AC Works", "Heat Works"] },
        photos: ["https://picsum.photos/seed/accord2019/600/400"],
        status: "available", sellerAvailability: "available_now",
      },
      {
        title: "2015 Ford F-150 XLT SuperCrew – 4WD, Financing Available",
        category: "Vehicles", subCategory: "Truck", listingType: "financing", sellerType: "Dealer",
        purchaseType: "financing", brand: "Ford", model: "F-150", year: 2015,
        vehicleMileage: 118000, titleStatus: "Clean Title", condition: "Good",
        price: 18900, priceType: "firm", makeOfferEnabled: false, askingType: "fixed",
        city: "Mobile", state: "AL", zipcode: "36601", locationApprox: "Mobile, AL",
        description: "Tow package, bed liner, backup camera. Clean Carfax. Financing available for all credit types.",
        details: { transmission: "Automatic", fuelType: "Gasoline", driveType: "4WD", downPayment: 1500, monthlyPayment: 389, termLength: "60 months", interestRate: 12.9, creditCheckRequired: true, minCreditScore: 540, proofOfIncomeRequired: true, conditionFlags: ["Runs & Drives", "AC Works", "Heat Works"] },
        photos: ["https://picsum.photos/seed/f150xlt/600/400"],
        status: "available", sellerAvailability: "available_now",
      },
      {
        title: "2011 Dodge Charger R/T – Buy Here Pay Here, $1,200 Down",
        category: "Vehicles", subCategory: "Car", listingType: "bhph", sellerType: "Buy Here Pay Here",
        purchaseType: "bhph", brand: "Dodge", model: "Charger", year: 2011,
        vehicleMileage: 147000, titleStatus: "Clean Title", condition: "Fair",
        price: 9800, priceType: "firm", makeOfferEnabled: false, askingType: "fixed",
        city: "Mobile", state: "AL", zipcode: "36605", locationApprox: "Mobile, AL",
        description: "Hemi V8, runs strong. Some cosmetic wear. No credit check required.",
        details: { transmission: "Automatic", fuelType: "Gasoline", downPayment: 1200, monthlyPayment: 259, termLength: "48 months", creditCheckRequired: false, proofOfIncomeRequired: true, conditionFlags: ["Runs & Drives", "AC Works"] },
        photos: ["https://picsum.photos/seed/chargerrt/600/400"],
        status: "available", sellerAvailability: "today",
      },
      {
        title: "3 BR / 2 BA House for Rent – $1,250/mo, Pets OK",
        category: "Property", subCategory: "House", listingType: "for_rent", sellerType: "Owner",
        purchaseType: null, brand: null, model: null, year: null,
        price: 1250, priceType: "firm", makeOfferEnabled: false, askingType: "fixed",
        city: "Mobile", state: "AL", zipcode: "36608", locationApprox: "Mobile, AL",
        description: "Spacious 3/2 in quiet neighborhood. Fenced backyard, central heat/AC, washer/dryer hookups. 12-month lease.",
        details: { propertyType: "House", bedrooms: "3", bathrooms: "2", squareFeet: 1450, yearBuilt: 1998, deposit: 1250, leaseLength: "12 months", applicationFee: 50, incomeRequirement: "3x Rent", creditCheckRequired: true, minCreditScore: 580, backgroundCheck: true, evictionsAccepted: "No", section8: "Case-by-case", petPolicy: "Yes", petDeposit: 300, petRent: 25, features: ["Central Heat", "Central AC", "Fenced Yard", "Washer/Dryer"] },
        photos: ["https://picsum.photos/seed/house3br/600/400"],
        status: "available", sellerAvailability: "available_now",
      },
      {
        title: "Furnished Studio – Short-Term Stay, $65/Night",
        category: "Property", subCategory: "Apartment", listingType: "short_term", sellerType: "Owner",
        purchaseType: null, brand: null, model: null, year: null,
        price: 65, priceType: "firm", makeOfferEnabled: false, askingType: "fixed",
        city: "Mobile", state: "AL", zipcode: "36602", locationApprox: "Mobile, AL",
        description: "Cozy furnished studio near downtown. Full kitchen, fast WiFi, parking included. Min 2-night stay.",
        details: { propertyType: "Apartment", bedrooms: "Studio", bathrooms: "1", squareFeet: 420, nightlyRate: 65, weeklyRate: 390, cleaningFee: 45, maxGuests: 2, minStay: 2, features: ["Internet Included", "Furnished", "Central AC"] },
        photos: ["https://picsum.photos/seed/studio65/600/400"],
        status: "available", sellerAvailability: "available_now",
      },
      {
        title: "0.75 Acre Lot – Mobile, AL – Owner Financing Available",
        category: "Property", subCategory: "Land", listingType: "owner_financing", sellerType: "Owner",
        purchaseType: null, brand: null, model: null, year: null,
        price: 28000, priceType: "firm", makeOfferEnabled: true, askingType: "obo",
        city: "Mobile", state: "AL", zipcode: "36619", locationApprox: "Mobile, AL",
        description: "Cleared residential lot, utilities at street. Great for new build. Owner will finance with 10% down.",
        details: { propertyType: "Land", acreage: "0.75 acres", zoning: "Residential", ownerFinancing: true, ownerDownPayment: 2800, ownerMonthlyPayment: 350, ownerTermLength: "84 months" },
        photos: ["https://picsum.photos/seed/landlot75/600/400"],
        status: "available", sellerAvailability: "appointment",
      },
      {
        title: "DeWalt 3000 PSI Pressure Washer – Works Great, $75/Day Rental",
        category: "Tools & Equipment", listingType: null, sellerType: "Private Seller",
        purchaseType: "cash_sale", brand: "DeWalt", model: "DWPW3000",
        condition: "Good", price: 375, priceType: "firm", makeOfferEnabled: true, askingType: "obo",
        city: "Mobile", state: "AL", zipcode: "36606", locationApprox: "Mobile, AL",
        description: "Electric start, Honda engine. Comes with extension wand, 25ft hose, and surface cleaner attachment.",
        details: { toolType: "Construction", worksProper: "Yes", batteryIncluded: "N/A", chargerIncluded: "N/A", rentalAvailable: true, rentalPrice: 75, rentalDeposit: 100 },
        photos: ["https://picsum.photos/seed/pressurewasher/600/400"],
        status: "available", sellerAvailability: "available_now",
      },
      {
        title: "iPhone 14 Pro 256GB – Unlocked, 91% Battery, Space Black",
        category: "Electronics", listingType: null, sellerType: "Private Seller",
        purchaseType: "cash_sale", brand: "Apple", model: "iPhone 14 Pro",
        condition: "Like New", price: 680, priceType: "firm", makeOfferEnabled: true, askingType: "obo",
        city: "Mobile", state: "AL", zipcode: "36604", locationApprox: "Mobile, AL",
        description: "Excellent condition, used 6 months. No scratches, original box included. Unlocked for all carriers.",
        details: { deviceType: "Smartphone", storageSize: "256GB", carrier: "Unlocked", unlocked: "Yes", crackedScreen: false, batteryHealth: "91%", includesCharger: true },
        photos: ["https://picsum.photos/seed/iphone14pro/600/400"],
        status: "available", sellerAvailability: "available_now",
      },
      {
        title: "Ashley Furniture Sectional Sofa – Gray, Delivery Available",
        category: "Furniture", listingType: null, sellerType: "Private Seller",
        purchaseType: "cash_sale", brand: "Ashley", model: null,
        condition: "Good", price: 450, priceType: "firm", makeOfferEnabled: true, askingType: "obo",
        city: "Mobile", state: "AL", zipcode: "36609", locationApprox: "Mobile, AL",
        description: "Moving sale. 3-piece sectional, gray fabric, good condition. Pet-free, smoke-free home. Delivery available for $50.",
        details: { furnitureType: "Sectional", material: "Fabric", color: "Gray", dimensions: "110\" x 85\"", deliveryAvailable: true, assemblyRequired: false, smokeFreeHome: true, petFreeHome: true },
        photos: ["https://picsum.photos/seed/sectionalsofa/600/400"],
        status: "available", sellerAvailability: "this_week",
      },
      {
        title: "Whirlpool Washer & Dryer Set – Works Perfect, Delivery Available",
        category: "Appliances", listingType: null, sellerType: "Private Seller",
        purchaseType: "cash_sale", brand: "Whirlpool", model: "WTW4816FW",
        condition: "Good", price: 425, priceType: "firm", makeOfferEnabled: true, askingType: "obo",
        city: "Mobile", state: "AL", zipcode: "36606", locationApprox: "Mobile, AL",
        description: "Full-size top-load washer and electric dryer. Work perfectly. Upgrading, must go this weekend.",
        details: { applianceType: "Washer/Dryer Set", gasOrElectric: "Electric", worksProper: "Yes", deliveryAvailable: true, installationAvailable: false, warrantyRemaining: false },
        photos: ["https://picsum.photos/seed/washerdryer/600/400"],
        status: "available", sellerAvailability: "available_now",
      },
      {
        title: "2018 Tracker Pro Team 175 TXW – 90HP, Clean Title, Trailer Included",
        category: "Boats & Marine", listingType: null, sellerType: "Private Seller",
        purchaseType: "cash_sale", brand: "Tracker", model: "Pro Team 175 TXW", year: 2018,
        titleStatus: "Clean Title", condition: "Good",
        price: 11500, priceType: "firm", makeOfferEnabled: true, askingType: "obo",
        city: "Mobile", state: "AL", zipcode: "36601", locationApprox: "Mobile, AL",
        description: "90HP Mercury motor, 260 hours. Live well, trolling motor, depth finder. Title in hand. Trailer included.",
        details: { boatType: "Fishing Boat", boatLength: "17", engineType: "Outboard", hours: "260", trailerIncluded: true, boatRuns: "Yes" },
        photos: ["https://picsum.photos/seed/tracker175/600/400"],
        status: "available", sellerAvailability: "available_now",
      },
    ];

    for (const s of samples) {
      const slugBase = s.title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").slice(0, 70);
      const result = await pool.query(
        `INSERT INTO marketplace_items (
          seller_id, seller_name, title, description, category, sub_category, listing_type,
          seller_type, purchase_type, brand, model, year, vehicle_mileage, title_status,
          condition, price, price_type, make_offer_enabled, asking_type, city, state, zipcode,
          location_approx, photos, status, seller_availability, details, is_sample,
          expires_at, approximate_location_only, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$31)
        RETURNING id`,
        [
          sellerId, sellerName, s.title, s.description || null, s.category,
          (s as any).subCategory || null, s.listingType || null, s.sellerType || null,
          s.purchaseType || null, (s as any).brand || null, (s as any).model || null,
          (s as any).year || null, (s as any).vehicleMileage || null, (s as any).titleStatus || null,
          (s as any).condition || null, s.price, s.priceType, s.makeOfferEnabled, s.askingType,
          s.city, s.state, s.zipcode, s.locationApprox,
          JSON.stringify(s.photos), s.status, s.sellerAvailability,
          JSON.stringify(s.details), true, expires, true, now,
        ]
      );
      const id = result.rows[0].id;
      const slug = `${slugBase}-${id}`;
      await pool.query("UPDATE marketplace_items SET public_slug = $1 WHERE id = $2", [slug, id]);
    }
    console.log("[GUBER] Marketplace sample listings seeded.");
  } catch (e: any) {
    console.error("[GUBER] seedMarketplaceSamples error:", e.message);
  }
}
