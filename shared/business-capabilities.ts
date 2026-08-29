export const BUSINESS_CAPABILITIES = [
  {
    key: "public_profile",
    label: "Public business profile",
    description: "Show your verified business identity, logo, services, location, and hours.",
  },
  {
    key: "customer_inquiries",
    label: "Customer inquiries",
    description: "Let customers send a short general question without exposing personal contact details.",
  },
  {
    key: "service_availability",
    label: "Service availability",
    description: "Show the areas, hours, and availability notes that help customers decide when to reach you.",
  },
  {
    key: "quote_requests",
    label: "Quote requests",
    description: "Receive a general scope request before you decide whether to prepare a quote.",
  },
  {
    key: "consultation_requests",
    label: "Consultation requests",
    description: "Offer an initial consultation request with safe, general scheduling information.",
  },
  {
    key: "appointments",
    label: "Appointment requests",
    description: "Let customers request an appointment time without requiring a full booking setup.",
  },
  {
    key: "booking",
    label: "Booking & appointments",
    description: "Offer configured services with instant booking, business approval, or quote request modes.",
  },
] as const;

export type BusinessCapability = typeof BUSINESS_CAPABILITIES[number]["key"];
export const DEFAULT_BUSINESS_CAPABILITIES: BusinessCapability[] = [
  "public_profile",
  "customer_inquiries",
  "service_availability",
];

export const PROFESSIONAL_SERVICE_CATEGORIES = [
  { key: "medical_practice", label: "Doctor or medical practice" },
  { key: "dental_practice", label: "Dentist or dental practice" },
  { key: "clinic", label: "Clinic or healthcare organization" },
  { key: "legal_practice", label: "Lawyer or legal practice" },
  { key: "accounting_practice", label: "Accountant or tax practice" },
  { key: "financial_advisory", label: "Financial or investment advisory" },
  { key: "other_regulated", label: "Other regulated professional service" },
] as const;

export type ProfessionalServiceCategory = typeof PROFESSIONAL_SERVICE_CATEGORIES[number]["key"];

export const PROFESSIONAL_INDUSTRY_ALIASES = [
  "healthcare",
  "medical",
  "doctor",
  "dental",
  "dentist",
  "clinic",
  "legal",
  "law",
  "accounting",
  "accountant",
  "tax",
  "financial advisory",
  "investment advisory",
] as const;