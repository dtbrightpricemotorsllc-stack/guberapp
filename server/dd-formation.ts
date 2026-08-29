/**
 * D.D. Formation Steps — shared between routes.ts and JAC prompt/tool helpers.
 *
 * Generates an ordered checklist of real formation steps for a given business type and state.
 * Steps are persisted in dd_cases.steps and advanced by mark_dd_step_complete / PATCH /api/dd/case/:id/step.
 *
 * Required semantics:
 *   required: true  — legally mandated for this entity type in any U.S. jurisdiction (e.g. filing Articles)
 *   required: false — conditional on jurisdiction, industry, or business activity (see optional_reason)
 *
 * Never mark a step required: true if the obligation depends on state law variation, business activity,
 * or industry — those get required: false with a clear optional_reason explaining when it applies.
 */

export interface DDFormationStep {
  id: string;
  label: string;
  description: string;
  url: string | null;
  cost: string | null;
  required: boolean;
  optional_reason?: string;
  completed: boolean;
}

// Secretary of State name-search URLs by state
const SOS_SEARCH_URLS: Record<string, string> = {
  "ALABAMA": "https://www.sos.alabama.gov/business-services/business-name-search",
  "ALASKA": "https://www.commerce.alaska.gov/cbp/main/Search/Entities",
  "ARIZONA": "https://ecorp.azcc.gov/BusinessSearch/BusinessSearch",
  "ARKANSAS": "https://www.sos.arkansas.gov/corps/search_all.php",
  "CALIFORNIA": "https://bizfileonline.sos.ca.gov/search/business",
  "COLORADO": "https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do",
  "CONNECTICUT": "https://service.ct.gov/business/s/onlinebusinesssearch",
  "DELAWARE": "https://icis.corp.delaware.gov/ecorp/entitysearch/namesearch.aspx",
  "FLORIDA": "https://search.sunbiz.org/Inquiry/CorporationSearch/ByName",
  "GEORGIA": "https://ecorp.sos.ga.gov/BusinessSearch",
  "HAWAII": "https://hbe.ehawaii.gov/documents/search.html",
  "IDAHO": "https://www.accessidaho.org/public/sos/corp/search.html",
  "ILLINOIS": "https://www.ilsos.gov/corporatellc",
  "INDIANA": "https://bsd.sos.in.gov/publicbusinesssearch",
  "IOWA": "https://sos.iowa.gov/search/business/search.aspx",
  "KANSAS": "https://www.sos.ks.gov/businesses/business_entity_searches.html",
  "KENTUCKY": "https://app.sos.ky.gov/ftsearch",
  "LOUISIANA": "https://coraweb.sos.la.gov/CommercialSearch/CommercialSearch.aspx",
  "MAINE": "https://www.maine.gov/sos/cec/corp/search.html",
  "MARYLAND": "https://egov.maryland.gov/businessexpress/entitysearch",
  "MASSACHUSETTS": "https://corp.sec.state.ma.us/CorpWeb/CorpSearch/CorpSearch.aspx",
  "MICHIGAN": "https://cofs.lara.state.mi.us/SearchApi/Search/Search",
  "MINNESOTA": "https://mblsportal.sos.state.mn.us/Business/Search",
  "MISSISSIPPI": "https://corp.sos.ms.gov/corp/portal/c/page/corpBusinessIdSearch/portal.aspx",
  "MISSOURI": "https://bsd.sos.mo.gov/BusinessEntity/BESearch.aspx",
  "MONTANA": "https://biz.sosmt.gov/search",
  "NEBRASKA": "https://www.nebraska.gov/sos/corp/corpsearch.cgi",
  "NEVADA": "https://esos.nv.gov/EntitySearch/OnlineEntitySearch",
  "NEW HAMPSHIRE": "https://quickstart.sos.nh.gov/online/Account/LookupSummary",
  "NEW JERSEY": "https://www.njportal.com/DOR/businessnames",
  "NEW MEXICO": "https://portal.sos.state.nm.us/BFS/online/CorporationSearch",
  "NEW YORK": "https://apps.dos.ny.gov/publicInquiry",
  "NORTH CAROLINA": "https://www.sosnc.gov/online_services/search/by_title/_Business_Registration",
  "NORTH DAKOTA": "https://firststop.sos.nd.gov/search/business",
  "OHIO": "https://businesssearch.ohiosos.gov",
  "OKLAHOMA": "https://www.sos.ok.gov/corp/corpInquiryFind.aspx",
  "OREGON": "https://sos.oregon.gov/business/Pages/find.aspx",
  "PENNSYLVANIA": "https://www.corporations.pa.gov/search/corpsearch",
  "RHODE ISLAND": "https://business.sos.ri.gov/CorpWeb/CorpSearch/CorpSearch.aspx",
  "SOUTH CAROLINA": "https://businessfilings.sc.gov/BusinessFiling/Entity/Search",
  "SOUTH DAKOTA": "https://sosenterprise.sd.gov/BusinessServices/Business/FilingSearch.aspx",
  "TENNESSEE": "https://tnbear.tn.gov/ECommerce/FilingSearch.aspx",
  "TEXAS": "https://www.sos.state.tx.us/corp/sosda/index.shtml",
  "UTAH": "https://secure.utah.gov/bes/index.html",
  "VERMONT": "https://bizfilings.vermont.gov/online/Inquiry",
  "VIRGINIA": "https://cis.scc.virginia.gov",
  "WASHINGTON": "https://ccfs.sos.wa.gov",
  "WEST VIRGINIA": "https://apps.wv.gov/sos/BusinessEntitySearch",
  "WISCONSIN": "https://www.wdfi.org/apps/CorpSearch/Search.aspx",
  "WYOMING": "https://wyobiz.wyo.gov/Business/FilingSearch.aspx",
};

const LLC_FILING_COSTS: Record<string, string> = {
  "ALABAMA": "$200", "ALASKA": "$250", "ARIZONA": "$50", "ARKANSAS": "$45",
  "CALIFORNIA": "$70", "COLORADO": "$50", "CONNECTICUT": "$120", "DELAWARE": "$90",
  "FLORIDA": "$125", "GEORGIA": "$100", "HAWAII": "$50", "IDAHO": "$100",
  "ILLINOIS": "$150", "INDIANA": "$95", "IOWA": "$50", "KANSAS": "$160",
  "KENTUCKY": "$40", "LOUISIANA": "$100", "MAINE": "$175", "MARYLAND": "$100",
  "MASSACHUSETTS": "$500", "MICHIGAN": "$50", "MINNESOTA": "$155", "MISSISSIPPI": "$50",
  "MISSOURI": "$50", "MONTANA": "$35", "NEBRASKA": "$100", "NEVADA": "$75",
  "NEW HAMPSHIRE": "$100", "NEW JERSEY": "$125", "NEW MEXICO": "$50", "NEW YORK": "$200",
  "NORTH CAROLINA": "$125", "NORTH DAKOTA": "$135", "OHIO": "$99", "OKLAHOMA": "$100",
  "OREGON": "$100", "PENNSYLVANIA": "$125", "RHODE ISLAND": "$150", "SOUTH CAROLINA": "$110",
  "SOUTH DAKOTA": "$150", "TENNESSEE": "$300", "TEXAS": "$300", "UTAH": "$70",
  "VERMONT": "$125", "VIRGINIA": "$100", "WASHINGTON": "$180", "WEST VIRGINIA": "$100",
  "WISCONSIN": "$130", "WYOMING": "$100",
};

const CORP_FILING_COSTS: Record<string, string> = {
  "ALABAMA": "$200", "CALIFORNIA": "$100", "DELAWARE": "$89", "FLORIDA": "$70",
  "GEORGIA": "$100", "NEVADA": "$75", "NEW YORK": "$125", "TEXAS": "$300",
  "WYOMING": "$100",
};

export function buildDdFormationSteps(businessType: string, state: string): DDFormationStep[] {
  const bType = (businessType || "LLC").toUpperCase().replace(/-/g, "_");
  const steps: DDFormationStep[] = [];

  const stateKey = (state || "").toUpperCase().trim();
  const sosUrl = SOS_SEARCH_URLS[stateKey] || null;

  const filingCost =
    bType === "LLC"
      ? (LLC_FILING_COSTS[stateKey] || "$50–$300")
      : bType.includes("CORP")
      ? (CORP_FILING_COSTS[stateKey] || "$70–$300")
      : null;

  // Step 1: Name availability — always required before filing anything
  steps.push({
    id: "name_search",
    label: "Search business name availability",
    description: `Confirm your desired business name is available in ${state || "your state"} before filing. Check the Secretary of State database.`,
    url: sosUrl,
    cost: "Free",
    required: true,
    completed: false,
  });

  // Step 2: Formation filing (not needed for sole proprietors — no state filing required)
  if (bType !== "SOLE_PROPRIETOR" && bType !== "SOLE PROPRIETOR") {
    const entityLabel =
      bType === "LLC" ? "Articles of Organization" :
      bType.includes("CORP") ? "Articles of Incorporation" :
      bType.includes("PARTNER") ? "Partnership registration" : "Formation documents";
    steps.push({
      id: "formation_filing",
      label: `File ${entityLabel} with the Secretary of State`,
      description: `Submit your ${entityLabel} to the ${state || "state"} Secretary of State to officially form your ${businessType}.`,
      url: sosUrl,
      cost: filingCost,
      required: true,
      completed: false,
    });
  }

  // Step 3: Registered Agent — required by all U.S. states for LLCs and corporations
  if (bType === "LLC" || bType.includes("CORP")) {
    steps.push({
      id: "registered_agent",
      label: "Appoint a registered agent",
      description: `${state || "Your state"} requires every LLC and corporation to have a registered agent with a physical in-state address. You can serve as your own agent (free) or use a service ($50–$300/yr).`,
      url: null,
      cost: "$0 (self) or $50–$300/yr (service)",
      required: true,
      completed: false,
    });
  }

  // Step 4: EIN — conditional for ALL entity types.
  // Even a single-member LLC without employees may use the owner's SSN per IRS rules.
  // EIN becomes required the moment any of these apply: has employees, elected S-Corp
  // tax treatment, is a C-Corp or multi-member partnership, has a Keogh plan, or
  // files excise/alcohol/tobacco/firearms taxes.
  steps.push({
    id: "ein",
    label: "Apply for an EIN (Employer Identification Number)",
    description: "Get your EIN from the IRS — free, online, instant. Required in several common situations; recommended for all businesses to keep your SSN off business documents.",
    url: "https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online",
    cost: "Free",
    required: false,
    optional_reason: "Required if you have or plan to hire employees, are a C-Corp, multi-member LLC/partnership, or elected S-Corp tax treatment. Single-member LLCs and sole proprietors with no employees may use their owner's SSN instead — but an EIN is strongly recommended to protect your SSN and is required the moment you hire anyone.",
    completed: false,
  });

  // Step 5: State tax registration — conditional on state law and business activity
  steps.push({
    id: "state_tax",
    label: "Check state tax registration requirements",
    description: `Find out whether ${state || "your state"} requires you to register for sales tax, business privilege tax, or payroll tax withholding. Requirements depend on your state, entity type, and whether you sell taxable goods or have employees.`,
    url: null,
    cost: "Free",
    required: false,
    optional_reason: "Required if your state imposes sales tax on your products/services, or if you hire employees. States without income tax (TX, FL, WA, WY, etc.) may still require sales tax registration. Verify with your state Department of Revenue.",
    completed: false,
  });

  // Step 6: Operating Agreement (LLC) or Bylaws (Corp)
  if (bType === "LLC") {
    steps.push({
      id: "operating_agreement",
      label: "Draft an Operating Agreement",
      description: "An Operating Agreement defines ownership, roles, and decision-making. Most states don't require filing it — keep it internally. Strongly protects you in disputes.",
      url: null,
      cost: "$0 (DIY) or $150–$500+ (attorney)",
      required: false,
      optional_reason: "Not legally required to file in most states, but strongly recommended for multi-member LLCs and valuable even for single-member LLCs.",
      completed: false,
    });
  } else if (bType.includes("CORP")) {
    steps.push({
      id: "bylaws",
      label: "Adopt corporate bylaws",
      description: "Bylaws govern shareholder meetings, officer roles, and voting. Required internally for all U.S. corporations; rarely filed with the state.",
      url: null,
      cost: "$0 (DIY) or $200–$600 (attorney)",
      required: true,
      completed: false,
    });
  }

  // Step 7: Local licenses — conditional on jurisdiction and activity
  steps.push({
    id: "local_licenses",
    label: "Check county and city license requirements",
    description: "Some counties and cities require a local business license or home occupation permit; many do not. Check your specific county clerk and city hall to find out what applies to you.",
    url: null,
    cost: "$25–$150 if required (varies by jurisdiction)",
    required: false,
    optional_reason: "Required in some jurisdictions, not in others. Depends on your city, county, and type of activity. This is a check step — your situation determines whether a license is actually needed.",
    completed: false,
  });

  // Step 8: Industry licenses — conditional on regulated industry only
  steps.push({
    id: "industry_licenses",
    label: "Check for industry-specific licenses or permits",
    description: "Regulated industries (food service, childcare, construction, healthcare, real estate, etc.) require additional state or federal licenses. Most general service and retail businesses do not.",
    url: "https://www.sba.gov/business-guide/launch-your-business/apply-licenses-permits",
    cost: "Varies — many industries have no requirement",
    required: false,
    optional_reason: "Only required for regulated industries. If you are not in healthcare, food, childcare, construction, real estate, or another regulated field, you likely need nothing beyond standard business registration.",
    completed: false,
  });

  // Step 9: Business bank account — strongly recommended but not a legal requirement
  steps.push({
    id: "bank_account",
    label: "Open a dedicated business bank account",
    description: "Keep personal and business finances separate. Bring your EIN, formation documents, and ID. Many banks offer free business checking.",
    url: null,
    cost: "Free (most banks)",
    required: false,
    optional_reason: "Not a legal requirement, but strongly recommended for tax clarity and maintaining your liability protection. Required by most commercial landlords and lenders.",
    completed: false,
  });

  // Step 10: Business insurance — conditional on use case
  steps.push({
    id: "insurance",
    label: "Get basic business insurance",
    description: "General liability insurance protects you if a client claims injury or property damage. Required by most commercial landlords; strongly recommended if you serve customers in person.",
    url: null,
    cost: "$400–$1,500/yr (varies)",
    required: false,
    optional_reason: "Required if you sign a commercial lease or have clients on-premises. Optional for home-based or fully online businesses, though still recommended.",
    completed: false,
  });

  // Step 11: GUBER Business onboarding
  steps.push({
    id: "guber_onboarding",
    label: "Connect your business to GUBER",
    description: "Register on GUBER as a business to access the talent marketplace, post jobs, and reach verified workers in your area.",
    url: "/business/signup",
    cost: "Free",
    required: false,
    optional_reason: "Only if you plan to hire through GUBER. Skip if you have your own hiring process.",
    completed: false,
  });

  return steps;
}
