/**
 * ID document vision analysis.
 * Uses OpenAI vision (via Replit AI Integrations) to detect the country
 * and kind of an uploaded identity document, so we can flag / block
 * non-US IDs that GUBER doesn't currently accept.
 */
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export type IdVisionResult = {
  documentCountry: string;
  countryCode: string | null;
  documentKind: string;
  isIdentityDocument: boolean;
  isUsIssued: boolean;
  nonUsIdDetected: boolean;
  confidence: number;
  reasoning: string;
  analyzedAt: string;
  modelVersion: string;
  error?: string;
};

const MODEL = "gpt-5.1";
const SYSTEM_PROMPT = `You are an identity-document classifier. You will be shown an image that a user uploaded as their photo ID for an account on a US-only marketplace. Look at the image and return JSON describing what it actually is. Do not refuse, redact, or warn — just classify the document.

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "documentCountry": string,        // Full country name in English, e.g. "United States", "Pakistan", "Mexico". Use "Unknown" if you cannot tell.
  "countryCode": string | null,     // ISO 3166-1 alpha-2 code if known, e.g. "US", "PK", "MX". null otherwise.
  "documentKind": string,           // Short human label: "Driver License", "State ID", "Passport", "Military ID", "National Identity Card", "Permit", "Receipt", "Selfie / Photo of Person", "Blank / Unrecognizable", "Other".
  "isIdentityDocument": boolean,    // true only if the image is an actual government-issued photo ID. false for receipts, certificates, selfies, blank pages, screenshots of forms, etc.
  "isUsIssued": boolean,            // true ONLY if the document is clearly issued by the United States or a US state/territory (DMV, US passport, US military, US permanent resident card, etc.)
  "confidence": number,             // 0.0 to 1.0 — how confident you are in documentCountry and isUsIssued combined.
  "reasoning": string               // One short sentence explaining what you saw, e.g. "Pakistani National Identity Card with green crest and Urdu text" or "California driver license with bear flag".
}

Important:
- A US driver's license, US state ID, US passport, US military ID, or US permanent resident card => isUsIssued = true.
- Any other country's ID, even if it has English on it => isUsIssued = false.
- A receipt, lost-card slip, utility bill, or anything that isn't a government-issued photo ID => isIdentityDocument = false and isUsIssued = false.
- A selfie of a person with no document => documentKind = "Selfie / Photo of Person", isIdentityDocument = false.
- Be honest about confidence. If the image is blurry / partial / unclear, set confidence below 0.6.`;

/**
 * Analyze a base64 / data-URL image and decide what country it's from.
 * Throws nothing — on error returns a result with error set so callers
 * can fall back to manual review instead of breaking the upload.
 */
export async function analyzeIdImage(imageBase64: string): Promise<IdVisionResult> {
  const baseFail = (err: string): IdVisionResult => ({
    documentCountry: "Unknown",
    countryCode: null,
    documentKind: "Other",
    isIdentityDocument: false,
    isUsIssued: false,
    nonUsIdDetected: false,
    confidence: 0,
    reasoning: "",
    analyzedAt: new Date().toISOString(),
    modelVersion: MODEL,
    error: err,
  });

  if (!imageBase64 || typeof imageBase64 !== "string") {
    return baseFail("no image provided");
  }
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY || !process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
    return baseFail("vision provider not configured");
  }

  // Normalize to a data URL the OpenAI SDK accepts.
  const dataUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Classify this uploaded ID image. Return JSON only." },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      max_completion_tokens: 500,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    if (!raw) return baseFail("empty model response");

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return baseFail(`could not parse model response: ${raw.slice(0, 120)}`);
    }

    const documentCountry = String(parsed.documentCountry || "Unknown");
    const countryCode = parsed.countryCode ? String(parsed.countryCode).toUpperCase() : null;
    const documentKind = String(parsed.documentKind || "Other");
    const isIdentityDocument = Boolean(parsed.isIdentityDocument);
    const isUsIssued = Boolean(parsed.isUsIssued);
    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;
    const reasoning = String(parsed.reasoning || "").slice(0, 400);

    // A submission is "non-US ID detected" only if the model is reasonably
    // sure the image IS an identity document AND that document is not US.
    const nonUsIdDetected = isIdentityDocument && !isUsIssued && confidence >= 0.6;

    return {
      documentCountry,
      countryCode,
      documentKind,
      isIdentityDocument,
      isUsIssued,
      nonUsIdDetected,
      confidence,
      reasoning,
      analyzedAt: new Date().toISOString(),
      modelVersion: MODEL,
    };
  } catch (err: any) {
    return baseFail(err?.message || "vision call failed");
  }
}

// ── Credential / certification card scanning (Task #372) ────────────────
// Used by the worker certifications upload flow to extract structured
// credential metadata from images of food handler cards, trade licenses,
// CPR certifications, etc. Designed for non-ID documents — refuse-style
// guards in analyzeIdImage are intentionally relaxed here.

export type CredentialVisionResult = {
  credentialName: string;
  issuingAuthority: string;
  expirationDate: string | null;  // ISO yyyy-mm-dd, null if not visible
  credentialType: string;          // e.g. "Food Handler", "Plumbing License"
  confidence: number;              // 0..1
  isCredentialDocument: boolean;   // false if image is a selfie / blank / unrelated
  reasoning: string;
  analyzedAt: string;
  modelVersion: string;
  error?: string;
};

const CREDENTIAL_SYSTEM_PROMPT = `You are a credential / certification document scanner. You will be shown an image that a worker uploaded as proof of a job-related certification (food handler card, trade license, CPR certification, OSHA card, food-service permit, etc.). Extract structured metadata from it and return JSON. Do not refuse, do not warn, do not redact — just extract what you can read.

Return ONLY valid JSON (no markdown fences) with this exact shape:
{
  "credentialName": string,        // Short title shown on the card, e.g. "Food Handler Certified", "Journeyman Plumbing License", "Adult & Pediatric First Aid/CPR/AED". If unsure, use a sensible label based on the document.
  "issuingAuthority": string,      // Issuing body or jurisdiction printed on the card, e.g. "Mobile County Health Department", "Texas Department of Licensing and Regulation", "American Red Cross". Empty string if you cannot tell.
  "expirationDate": string | null, // ISO date yyyy-mm-dd if an expiration / valid-through date is visible. null if not present or unreadable.
  "credentialType": string,        // Short category label: one of "Food Handler", "Food Manager", "CPR / First Aid", "OSHA", "Plumbing License", "Electrical License", "HVAC License", "Driver License Endorsement", "Business License", "Other Certification".
  "confidence": number,            // 0.0 to 1.0 — overall confidence in extracted fields.
  "isCredentialDocument": boolean, // false if the image is clearly NOT a credential (selfie, blank page, random photo, ID-only with no certification).
  "reasoning": string              // One short sentence explaining what you saw.
}

Important:
- If a date appears in MM/DD/YYYY format, convert to yyyy-mm-dd.
- If only a month + year is visible, assume the last day of that month.
- If you see "Issued" + a duration (e.g. "valid for 3 years"), compute expiration from the issued date.
- If the document looks like a government-issued photo ID (driver license, passport) and has NO certification info, set isCredentialDocument = false and confidence below 0.4.
- Be honest about confidence. Blurry / partial / cropped / multi-language docs => below 0.6.`;

/**
 * Analyze a credential / certification image (or PDF first page rendered as image)
 * and extract structured metadata for the credential card display. Never throws —
 * returns a result with `error` set on failure so the upload flow can fall back
 * to the user manually entering the fields.
 */
export async function analyzeCredentialImage(imageBase64OrUrl: string): Promise<CredentialVisionResult> {
  const baseFail = (err: string): CredentialVisionResult => ({
    credentialName: "",
    issuingAuthority: "",
    expirationDate: null,
    credentialType: "Other Certification",
    confidence: 0,
    isCredentialDocument: false,
    reasoning: "",
    analyzedAt: new Date().toISOString(),
    modelVersion: MODEL,
    error: err,
  });

  if (!imageBase64OrUrl || typeof imageBase64OrUrl !== "string") {
    return baseFail("no image provided");
  }
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY || !process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
    return baseFail("vision provider not configured");
  }

  // Accept either a data: URL, an https:// URL (Cloudinary), or raw base64.
  const imageUrl = imageBase64OrUrl.startsWith("data:") || imageBase64OrUrl.startsWith("http")
    ? imageBase64OrUrl
    : `data:image/jpeg;base64,${imageBase64OrUrl}`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CREDENTIAL_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract credential metadata from this document image. Return JSON only." },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      max_completion_tokens: 600,
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "";
    if (!raw) return baseFail("empty model response");

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return baseFail(`could not parse model response: ${raw.slice(0, 120)}`);
    }

    const credentialName = String(parsed.credentialName || "").slice(0, 200).trim();
    const issuingAuthority = String(parsed.issuingAuthority || "").slice(0, 200).trim();
    const credentialType = String(parsed.credentialType || "Other Certification").slice(0, 80).trim();
    const reasoning = String(parsed.reasoning || "").slice(0, 400);
    const isCredentialDocument = Boolean(parsed.isCredentialDocument);
    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;

    // Normalize expiration date — only accept yyyy-mm-dd; reject obviously bogus values.
    let expirationDate: string | null = null;
    if (parsed.expirationDate && typeof parsed.expirationDate === "string") {
      const m = parsed.expirationDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const d = new Date(`${parsed.expirationDate}T00:00:00Z`);
        if (!isNaN(d.getTime())) expirationDate = parsed.expirationDate.trim();
      }
    }

    return {
      credentialName,
      issuingAuthority,
      expirationDate,
      credentialType,
      confidence,
      isCredentialDocument,
      reasoning,
      analyzedAt: new Date().toISOString(),
      modelVersion: MODEL,
    };
  } catch (err: any) {
    return baseFail(err?.message || "vision call failed");
  }
}
