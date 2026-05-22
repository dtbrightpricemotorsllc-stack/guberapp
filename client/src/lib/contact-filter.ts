export interface ContactCheckResult {
  found: boolean;
  reason: string | null;
}

const PHONE_PATTERNS = [
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/,
  /\(\d{3}\)\s*\d{3}[-.\s]\d{4}/,
  /\+1[-.\s]?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/,
  /\b\d{10}\b/,
  /\b\d{3}[-.\s]\d{4}\b/,
];

const EMAIL_PATTERN = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

const OFFPLATFORM_KEYWORDS = [
  /\bcash\s*app\b/i,
  /\bvenmo\b/i,
  /\bpaypal\b/i,
  /\bzelle\b/i,
  /\btelegram\b/i,
  /\bwhatsapp\b/i,
  /\bsnapchat\b/i,
  /\bsignal\b/i,
  /\bkik\b/i,
  /\bskype\b/i,
  /\bfacebook\b/i,
  /\bmessenger\b/i,
  /\binstagram\b/i,
  /\btext\s*me\b/i,
  /\bcall\s*me\b/i,
  /\bemail\s*me\b/i,
  /\bdm\s*me\b/i,
  /\bhit\s*me\s*up\b/i,
  /\breach\s*me\b/i,
  /\bcontact\s*me\s*(at|via|on|@)\b/i,
  /\bout\s*of\s*app\b/i,
  /\boff\s*platform\b/i,
];

export function detectContactInfo(text: string): ContactCheckResult {
  if (!text) return { found: false, reason: null };

  for (const pattern of PHONE_PATTERNS) {
    if (pattern.test(text)) {
      return { found: true, reason: "phone number" };
    }
  }

  if (EMAIL_PATTERN.test(text)) {
    return { found: true, reason: "email address" };
  }

  for (const pattern of OFFPLATFORM_KEYWORDS) {
    if (pattern.test(text)) {
      const match = text.match(pattern);
      return { found: true, reason: match ? match[0].toLowerCase() : "off-platform contact info" };
    }
  }

  return { found: false, reason: null };
}

export const CONTACT_WARN_MSG =
  "For safety and trust, keep communication inside GUBER. Remove outside contact info before posting.";
