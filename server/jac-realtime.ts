/**
 * JAC Realtime — OpenAI Realtime API (WebRTC) session management.
 *
 * Responsibilities:
 *  1. Create ephemeral session tokens (server-side; API key never leaves server)
 *  2. Define JAC's system prompt + tool schemas
 *  3. Execute GUBER tool calls forwarded from the client's data channel
 */

import type { Pool } from "pg";
import { buildDdFormationSteps } from "./dd-formation";
import { JAC_MAIN_APP_CONCIERGE_POLICY, JAC_GUEST_HANDOFF_POLICY } from "./jac-team-guber-concierge";

// ── Constants ─────────────────────────────────────────────────────────────────
export const JAC_REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";
export const JAC_REALTIME_VOICE = "verse"; // warm, natural

// ── System Prompt ─────────────────────────────────────────────────────────────
export function buildJacSystemPrompt(user?: {
  displayName?: string;
  idVerified?: boolean;
  isWorker?: boolean;
  isHirer?: boolean;
  zip?: string;
} | null): string {
  const userCtx = user
    ? `\n\nUser context: name="${user.displayName || "unknown"}", id_verified=${user.idVerified ?? false}, is_worker=${user.isWorker ?? false}, is_hirer=${user.isHirer ?? false}${user.zip ? `, zip="${user.zip}"` : ""}.`
    : "\n\nUser context: not logged in (guest).";

  return `You are JAC — Team GUBER's concierge, resource navigator, and opportunity guide.

GUBER is a U.S.-only platform that turns one person into a team by connecting needs with people, skills, tools, transportation, assets, services, and opportunities. Jobs are one door among many, never the default response. GUBER = Global Unlimited Business & Employment Resources.

${JAC_MAIN_APP_CONCIERGE_POLICY}

${user ? "" : JAC_GUEST_HANDOFF_POLICY}

YOUR IDENTITY
- Name: JAC. Never claim to be human.
- Role: Help people move from need → practical action inside GUBER.
- You are not a search box or a customer-service script.
- You are a present, alert, warm, intelligent coordinator.

VOICE BEHAVIOR
- Listen for intent, not just keywords.
- Respond in short natural sections. No monologues.
- Use brief natural acknowledgements when genuinely fitting: "Okay.", "Yeah.", "I hear you.", "Got it.", "Mm-hmm.", "Let's work through that." — but NOT after every sentence.
- Ask ONLY ONE question at a time when you need more info.
- Never repeat back the user's words verbatim. Move things forward.
- Allow the user to interrupt. Stop immediately when they start speaking.
- Remember everything said earlier in the conversation.
- Vary your language. Never sound scripted or robotic.
- NAME PRONUNCIATION: Your name is JAC but when writing it in voice responses, always write it as "Jack" — text-to-speech reads "JAC" (all caps) as letters "J-A-C". Use "Jack" everywhere in your spoken text so it is pronounced correctly as a name.

OPPORTUNITY-FIRST METHOD
When someone says they need money or work, ask about usable assets BEFORE sending them to a job board:
- Skills? Tools? Transportation? Availability (hours/days)?
- Physical limitations? Service radius? Professional credentials?
- Items to sell? Services to offer?

Then recommend the strongest GUBER action, e.g.:
"You have a truck, evenings free, and experience moving. I can help you post an availability listing for evening hauling right now."

DO NOT just say "search for jobs." Help them form an offer or a plan.

KNOWLEDGEABLE FRIEND — GO DEEP WHEN IT HELPS
Jack knows the world, not just GUBER. When someone brings up something they want to sell, inspect, list, or get help with — go deep on the subject first. Real knowledge builds trust. Trust leads to action.

VEHICLES (selling, inspecting, hauling, transporting):
- Ask: year, make, model, mileage, condition, color, any mechanical issues?
- Know what affects resale: accident history, service records, modifications, tire wear
- Know what photos move listings: all 4 exterior angles, interior, odometer, VIN plate, any damage closeups
- Help them estimate a price range based on what they describe
- Bridge naturally: "That's a solid listing — ready to put it on GUBER Marketplace?"

ELECTRONICS (phones, laptops, tablets, gaming systems):
- Know major product lines: iPhone models, Samsung Galaxy S/A series, Google Pixel, iPad generations, MacBooks, gaming consoles
- Ask about: storage size, color, condition, battery health, accessories included, carrier lock status
- For phones: IMEI/serial number photo matters for buyer trust
- Know realistic resale ranges — help them price it right so it actually sells
- Bridge: "That's exactly what buyers search for on GUBER. Want to get it posted?"

HOME ITEMS (furniture, appliances, tools, equipment):
- Ask: brand, dimensions, age, condition, any damage, is delivery available?
- Know what drives value: brand name, material (solid wood vs. particle board), working condition
- Know what photos matter: full item, detail shots, any flaws disclosed honestly
- Tools and power equipment: condition, brand, accessories, hours of use if applicable

HOME REPAIRS & SERVICES:
- Know repair complexity: faucet swap is 30 min handyman work; panel wiring needs a licensed electrician
- Know what info helps a worker quote accurately: square footage, number of floors, specific symptoms, photos
- Help the user describe the job in a way that attracts the right workers at the right price

THE PATTERN — earn the action, never rush it:
1. Ask smart questions about what they have or need
2. Give genuinely useful advice (pricing, what to include, what to expect, photos that matter)
3. Let the GUBER action emerge naturally: "That's a great setup for a listing — want to get it live?"
4. If they're not ready: "No rush — I'll be right here when you are."
5. NEVER say "so you should post on GUBER" mid-conversation. Let value build first.

SOFT LANDING RULE: A comfortable, informed person takes action. A pressured person leaves. Always make the next GUBER step feel like the obvious, natural move — never a sales pitch.

GUBER FEATURE MAP
- Post a Job (hirer) → /post-job
- Browse Available Jobs → /browse-jobs
- Marketplace (buy/sell items, services) → /marketplace
- Load Board (transport, hauling) → /load-board
- Verify & Inspect (remote inspection) → /verify-inspect
- Sign Up → /signup
- Profile / Earnings → /profile
- Day-1 OG Membership → /og-advantage
- GUBER Studio (AI content) → /studio
- Cash Drops (reward events) → /cash-drops
- Post your own service listing → /marketplace (+ create)
- Business dashboard → /biz/dashboard
- D.D. Business Launch (formation guide) → /dd

ACTION FLOW (for every request)
1. Briefly acknowledge.
2. Identify the real need.
3. Ask one question if needed.
4. Use a GUBER tool to search or get information.
5. Present the strongest option first. Explain why it fits.
6. Ask permission before creating, posting, applying, or buying anything.
7. Confirm what happened after an action.
8. Give ONE next step — not a list.

D.D. BUSINESS LAUNCH — HANDOFF WORKFLOW
When someone says "I want to start a business", "how do I start an LLC", "how do I get an EIN", "I want to make my business official", "what licenses do I need", or similar:
1. Say: "That's D.D.'s department — she's Team GUBER's Business Development guide and will track every step."
2. Ask what type of business entity they want (LLC is most common; also sole proprietor, S-Corp, partnership, C-Corp).
3. Ask what state it will be registered in.
4. Once you have BOTH — call create_dd_case. This creates a real tracked formation case with all the steps for their entity and state, persisted to their account.
5. Tell them their case is set up and open D.D. now by calling navigate_to with route="/dd".
6. If they already have an active case (get_dd_state returns has_case: true) — tell them what step they're on and navigate to /dd to resume.
7. Do NOT try to walk through the full formation flow yourself. JAC gathers type + state, creates the case, and hands off. D.D. does the step-by-step guidance.
8. If the user is not logged in — navigate to /dd (they'll see the paywall/login). Do not attempt to create a case for a guest.

REQUIRED VS OPTIONAL HONESTY: Never tell a user a formation step is legally required when it is conditional. Steps like state tax registration, local licenses, and industry permits depend on state law, industry, and business activity. Always say "check whether this applies to you" for conditional steps.

SAFETY & HONESTY
- Never guarantee money, employment, housing, or specific earnings.
- Be clear when GUBER cannot fulfill something right now.
- Do not invent jobs, users, prices, or opportunities. Use search_opportunities and search_marketplace for real data.
- When data returns no results, say so honestly and help the user post instead.
- If someone expresses immediate danger or self-harm, respond warmly and direct them to emergency services first (911). After safety is addressed, help with GUBER if appropriate.

OPENING STYLE (first turn only)
"Hey, I'm Jack, GUBER's opportunity assistant. Tell me what you need, what you're trying to get done, or what situation you're dealing with — and we'll work out the next move."
${userCtx}`;
}

// ── Tool Schemas ──────────────────────────────────────────────────────────────
export const JAC_TOOLS = [
  {
    type: "function" as const,
    name: "search_opportunities",
    description: "Search GUBER for active job listings that a worker could apply for. Returns real postings from the platform. Use this when someone is looking for work, income opportunities, or specific job types. Always prefer a ZIP code filter when available.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keywords describing the type of work (e.g. 'lawn mowing', 'delivery driver', 'furniture moving', 'handyman')",
        },
        category: {
          type: "string",
          description: "Job category such as 'Lawn & Yard', 'Moving Help', 'Delivery', 'Verify & Inspect', 'General Labor', 'Skilled Trades', 'Caregiving', 'Cleaning', 'Driving'",
        },
        zip: {
          type: "string",
          description: "5-digit ZIP code to filter by location. Ask the user for this if not yet known and location is relevant.",
        },
      },
    },
  },
  {
    type: "function" as const,
    name: "search_marketplace",
    description: "Search the GUBER Marketplace for services, items for sale, or transport/hauling listings posted by other users. Use this when someone needs a service done for them or is looking to buy something.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search terms (e.g. 'lawn service', 'car inspection', 'truck rental', 'moving company', 'grass cutting')",
        },
        category: {
          type: "string",
          description: "Category filter — 'vehicles', 'services', 'items', 'transportation', 'real estate', 'other'",
        },
      },
    },
  },
  {
    type: "function" as const,
    name: "navigate_to",
    description: "Send the user to a specific page or feature within the GUBER app so they can take action. Call this after you have recommended an action and the user agrees. Always explain the reason briefly.",
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description: "The app route — e.g. '/post-job', '/marketplace', '/signup', '/verify-inspect', '/load-board', '/profile', '/browse-jobs', '/og-advantage', '/studio', '/cash-drops', '/dd', '/signup?intent=worker', '/signup?intent=hirer'",
        },
        reason: {
          type: "string",
          description: "Brief human-readable reason shown to user, e.g. 'post a job listing', 'browse available work near you', 'sign up and get verified', 'open D.D. Business Launch'",
        },
      },
      required: ["route", "reason"],
    },
  },
  {
    type: "function" as const,
    name: "get_platform_info",
    description: "Get current information about what GUBER offers, active feature availability, and how the platform works. Use when asked what GUBER is, what it can do, or how something on the platform works.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Topic to get info on — 'overview', 'fees', 'payments', 'verification', 'categories', 'load_board', 'marketplace', 'studio', 'cash_drops', 'og_membership', 'verify_inspect', 'dd_business_launch'",
        },
      },
    },
  },
  // ── D.D. Business Launch tools ────────────────────────────────────────────
  {
    type: "function" as const,
    name: "create_dd_case",
    description: "Create a persistent D.D. formation case for the authenticated user after gathering their business type and state. This creates a real tracked case with all the formation steps server-side. Call this ONLY after you know both the business_type AND the state. Requires the user to be signed in and have D.D. unlocked.",
    parameters: {
      type: "object",
      properties: {
        business_type: {
          type: "string",
          description: "The business entity type: 'LLC', 'Sole Proprietor', 'S-Corp', 'C-Corp', 'Partnership'. Ask the user if not yet known.",
        },
        business_name: {
          type: "string",
          description: "The intended business name, if the user has mentioned one. Omit if not yet known.",
        },
        state: {
          type: "string",
          description: "The U.S. state where the business will be registered, e.g. 'Alabama', 'Texas', 'California'. Ask the user if not yet known.",
        },
      },
      required: ["business_type", "state"],
    },
  },
  {
    type: "function" as const,
    name: "get_dd_state",
    description: "Get the current state of the authenticated user's active D.D. formation case — which step they are on, what's been completed, and what the next step is. Use this when the user returns to a D.D. conversation or you need to check their progress.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function" as const,
    name: "get_dd_next_action",
    description: "Get the next required formation step for the user's active D.D. case, including the official URL and cost if known. Use when resuming a D.D. conversation to tell the user exactly what to do next.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    type: "function" as const,
    name: "mark_dd_step_complete",
    description: "Mark the current (or a specific) formation step as done and advance the case to the next step. Call this when the user confirms they've completed a step.",
    parameters: {
      type: "object",
      properties: {
        case_id: {
          type: "number",
          description: "The D.D. case ID (from create_dd_case or get_dd_state).",
        },
        step_id: {
          type: "string",
          description: "The step ID to mark complete (e.g. 'name_search', 'ein', 'formation_filing'). Omit to mark the current step_index complete.",
        },
      },
      required: ["case_id"],
    },
  },
  {
    type: "function" as const,
    name: "resume_dd_case",
    description: "Resume a previously paused D.D. formation case by its case_id. Use when the user wants to continue a business they started before but paused. Call get_dd_state first to discover available paused cases, then call this with the case_id they want to resume.",
    parameters: {
      type: "object",
      properties: {
        case_id: {
          type: "number",
          description: "The ID of the paused D.D. case to resume.",
        },
      },
      required: ["case_id"],
    },
  },
  {
    type: "function" as const,
    name: "return_from_dd_to_jac",
    description: "Signal the end of a D.D. session and return the user to the main JAC interface. Use when the user says they're done with D.D. or wants to do something else on GUBER.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

// ── Session Creation ──────────────────────────────────────────────────────────
export interface RealtimeSessionOptions {
  user?: Parameters<typeof buildJacSystemPrompt>[0];
}

export async function createJacRealtimeSession(opts: RealtimeSessionOptions = {}): Promise<{
  ephemeralKey: string;
  sessionId: string;
  model: string;
  voice: string;
  expiresAt: number;
}> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI API key not configured");

  const instructions = buildJacSystemPrompt(opts.user);

  const body = {
    model: JAC_REALTIME_MODEL,
    voice: JAC_REALTIME_VOICE,
    instructions,
    tools: JAC_TOOLS,
    tool_choice: "auto",
    input_audio_format: "pcm16",
    output_audio_format: "pcm16",
    turn_detection: {
      type: "server_vad",
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500,
      create_response: true,
    },
    input_audio_transcription: {
      model: "whisper-1",
    },
    temperature: 0.8,
    max_response_output_tokens: 4096,
  };

  // Use standard OpenAI endpoint — bypass Replit proxy for Realtime API
  const baseURL = "https://api.openai.com/v1";
  const res = await fetch(`${baseURL}/realtime/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI Realtime session failed: ${res.status} ${err}`);
  }

  const data = await res.json() as any;
  return {
    ephemeralKey: data.client_secret?.value ?? "",
    sessionId: data.id ?? "",
    model: data.model ?? JAC_REALTIME_MODEL,
    voice: data.voice ?? JAC_REALTIME_VOICE,
    expiresAt: data.client_secret?.expires_at ?? Math.floor(Date.now() / 1000) + 60,
  };
}

// ── Tool Execution ────────────────────────────────────────────────────────────
export async function executeJacTool(
  name: string,
  args: Record<string, any>,
  pool: Pool,
  userId?: number,
): Promise<Record<string, any>> {
  switch (name) {
    case "search_opportunities": {
      const params = new URLSearchParams();
      if (args.query) params.set("search", args.query);
      if (args.category) params.set("category", args.category);
      if (args.zip) params.set("zip", args.zip);
      params.set("limit", "8");

      const r = await fetch(`http://localhost:5000/api/public/jobs?${params}`);
      const jobs = r.ok ? await r.json() as any[] : [];

      if (!Array.isArray(jobs) || jobs.length === 0) {
        return {
          found: 0,
          message: "No active job listings match that search right now on GUBER. This is a good time to post your own availability instead.",
          jobs: [],
        };
      }

      return {
        found: jobs.length,
        jobs: jobs.slice(0, 6).map((j: any) => ({
          id: j.id,
          title: j.title,
          category: j.category,
          budget: j.budget ? `$${j.budget}` : "negotiable",
          location: j.locationApprox || j.zip || "nearby",
          urgent: j.urgentSwitch,
          payType: j.payType,
          jobType: j.jobType,
        })),
        message: `Found ${jobs.length} active listing${jobs.length !== 1 ? "s" : ""} on GUBER.`,
      };
    }

    case "search_marketplace": {
      const params = new URLSearchParams();
      if (args.query) params.set("q", args.query);
      if (args.category) params.set("category", args.category);
      params.set("limit", "6");

      const r = await fetch(`http://localhost:5000/api/marketplace?${params}`);
      const items = r.ok ? await r.json() as any[] : [];

      if (!Array.isArray(items) || items.length === 0) {
        return {
          found: 0,
          message: "No matching marketplace listings right now. You could post one yourself.",
          listings: [],
        };
      }

      return {
        found: items.length,
        listings: items.slice(0, 5).map((i: any) => ({
          id: i.id,
          title: i.title,
          category: i.category,
          price: i.price ? `$${i.price}` : "negotiable",
          location: i.location || i.city || "nearby",
          seller: i.sellerDisplayName || "verified user",
        })),
        message: `Found ${items.length} marketplace listing${items.length !== 1 ? "s" : ""}.`,
      };
    }

    case "navigate_to": {
      return {
        action: "navigate",
        route: args.route,
        reason: args.reason,
        message: `Navigating to ${args.route}`,
      };
    }

    case "get_platform_info": {
      const info: Record<string, string> = {
        overview: "GUBER (Global Unlimited Business & Employment Resources) is a U.S.-only local labor and services marketplace. Anyone can post jobs (free), find work, sell items, offer services, arrange transport, do remote Verify & Inspect, or create AI content in GUBER Studio. All users are ID-verified. Payments are handled securely via Stripe.",
        fees: "Posting jobs is always free. Workers pay a 10% platform fee on earnings. Day-1 OG members pay only 5%. No subscription required for basic access.",
        payments: "All service payments go through the GUBER platform (Stripe). No cash handoffs. Workers receive payment after job completion is confirmed. Funds are held in the GUBER wallet and can be cashed out to a bank account.",
        verification: "All GUBER users complete ID verification. This confirms real identity for both hirers and workers. You can see a worker's verified status, job history, and reviews before hiring.",
        categories: "Available job categories: Lawn & Yard, Moving Help, Delivery, General Labor, Cleaning, Handyman, Driving, Skilled Trades (plumbing, electrical, HVAC, roofing), Caregiving, Verify & Inspect, Photography, Event Help, and more.",
        load_board: "The GUBER Load Board connects drivers and haulers with people who need things transported. If you have a truck, van, or trailer — or need something hauled — this is the right place.",
        marketplace: "The GUBER Marketplace is where users list items for sale, services they offer, and vehicles. All listings are tied to verified accounts. You can message sellers or buyers directly.",
        studio: "GUBER Studio is an AI content generation suite. Users create AI videos, music, and more using credits. New users get 2 free trial credits. Credits can be earned through platform activity on iOS.",
        cash_drops: "Cash Drops are real-cash reward events released by GUBER. They appear on the map. First to claim wins. Day-1 OG members get early notifications.",
        og_membership: "Day-1 OG is GUBER's founding membership. Perks: 5% fee instead of 10%, permanent gold badge, early feature access, priority Cash Drop notifications, and +20 Studio credits/month.",
        verify_inspect: "Verify & Inspect lets you hire a GUBER worker to physically inspect a car, property, or item on your behalf — remotely. They document everything on camera in real time. Useful for out-of-state purchases.",
        dd_business_launch: "D.D. Business Launch is a $9.99 one-time unlock giving permanent access to Team GUBER's Business Development guide. D.D. walks you through forming an LLC, S-Corp, or any business entity step by step — including name search, Secretary of State filing, EIN, taxes, licenses, and banking readiness. All steps are tracked and saved to your account so you can pick up where you left off.",
      };

      const topic = args.topic || "overview";
      return {
        topic,
        info: info[topic] || info.overview,
      };
    }

    // ── D.D. Case Tools ────────────────────────────────────────────────────────
    case "create_dd_case": {
      if (!userId) {
        return {
          error: "Authentication required to create a D.D. case.",
          requires_auth: true,
          action: "navigate",
          route: "/dd",
          message: "The user needs to sign in first. Navigate to /dd — they'll see the unlock flow.",
        };
      }
      // Verify D.D. is unlocked
      const userRow = await pool.query(
        `SELECT dd_launch_unlocked FROM users WHERE id = $1`,
        [userId]
      );
      if (!userRow.rows.length || !userRow.rows[0].dd_launch_unlocked) {
        return {
          dd_unlocked: false,
          action: "navigate",
          route: "/dd",
          message: "D.D. Business Launch is not yet unlocked for this account. Navigating to /dd — they'll see the $9.99 unlock screen.",
        };
      }
      const { business_type, business_name, state } = args;
      const steps = buildDdFormationSteps(business_type || "LLC", state || "");
      // Advisory lock serializes all dd_cases activation operations per user
      const createClient = await pool.connect();
      let caseId: number;
      try {
        await createClient.query("BEGIN");
        await createClient.query(`SELECT pg_advisory_xact_lock($1)`, [userId]);
        await createClient.query(
          `UPDATE dd_cases SET status = 'paused', updated_at = NOW() WHERE user_id = $1 AND status = 'active'`,
          [userId]
        );
        const result = await createClient.query(
          `INSERT INTO dd_cases (user_id, business_type, business_name, state, step_index, steps, collected_fields, status)
           VALUES ($1, $2, $3, $4, 0, $5::jsonb, '{}'::jsonb, 'active') RETURNING id`,
          [userId, business_type || null, business_name || null, state || null, JSON.stringify(steps)]
        );
        await createClient.query("COMMIT");
        caseId = result.rows[0].id;
      } catch (txErr) {
        await createClient.query("ROLLBACK");
        throw txErr;
      } finally {
        createClient.release();
      }
      const currentStep = steps[0] || null;
      return {
        success: true,
        case_id: caseId,
        step_index: 0,
        total_steps: steps.length,
        current_step: currentStep,
        action: "navigate",
        route: "/dd",
        message: `D.D. case created (ID ${caseId}) for ${business_type || "LLC"} in ${state || "your state"}. ${steps.length} formation steps tracked. First step: "${currentStep?.label || "gathering details"}". Opening D.D. now.`,
      };
    }

    case "get_dd_state": {
      if (!userId) {
        return { has_case: false, error: "Authentication required.", requires_auth: true };
      }
      // Fetch all non-completed cases so JAC can enumerate paused ones for resume
      const allCaseRows = await pool.query(
        `SELECT id, business_type, business_name, state, step_index, steps, status, updated_at
         FROM dd_cases WHERE user_id = $1 ORDER BY updated_at DESC`,
        [userId]
      );
      const activeRow = allCaseRows.rows.find((r: any) => r.status === "active");
      const pausedRows = allCaseRows.rows.filter((r: any) => r.status === "paused");
      const completedRows = allCaseRows.rows.filter((r: any) => r.status === "completed");

      const summarize = (row: any) => {
        const steps: any[] = Array.isArray(row.steps) ? row.steps : [];
        return {
          case_id: row.id,
          business_type: row.business_type,
          business_name: row.business_name,
          state: row.state,
          step_index: row.step_index,
          total_steps: steps.length,
          completed_steps: steps.filter((s: any) => s.completed).length,
          status: row.status,
        };
      };

      if (!activeRow && pausedRows.length === 0 && completedRows.length === 0) {
        return {
          has_case: false,
          message: "No D.D. cases found. Ask for business type and state, then call create_dd_case.",
        };
      }

      const ddCase = activeRow || allCaseRows.rows[0];
      const steps: any[] = Array.isArray(ddCase.steps) ? ddCase.steps : [];
      const completedCount = steps.filter((s: any) => s.completed).length;
      const currentStep = steps[ddCase.step_index] || null;

      return {
        has_case: true,
        case_id: ddCase.id,
        business_type: ddCase.business_type,
        business_name: ddCase.business_name,
        state: ddCase.state,
        step_index: ddCase.step_index,
        total_steps: steps.length,
        completed_steps: completedCount,
        current_step: currentStep,
        status: ddCase.status,
        paused_cases: pausedRows.map(summarize),
        completed_cases: completedRows.map(summarize),
        message: activeRow
          ? `Active D.D. case found (ID ${ddCase.id}). Step ${ddCase.step_index + 1}/${steps.length}: "${currentStep?.label || "all done"}" (${completedCount} of ${steps.length} completed).${pausedRows.length > 0 ? ` The user also has ${pausedRows.length} paused case(s): ${pausedRows.map((r: any) => `ID ${r.id} (${r.business_type || "business"} in ${r.state || "unknown state"})`).join(", ")}. Call resume_dd_case with the relevant case_id to switch.` : ""}`
          : `No active case. The user has ${pausedRows.length} paused case(s): ${pausedRows.map((r: any) => `ID ${r.id} (${r.business_type || "business"} in ${r.state || "unknown state"})`).join(", ")}. Call resume_dd_case with the desired case_id.`,
      };
    }

    case "get_dd_next_action": {
      if (!userId) {
        return { error: "Authentication required.", requires_auth: true };
      }
      const caseRows = await pool.query(
        `SELECT * FROM dd_cases WHERE user_id = $1 AND status IN ('active', 'completed') ORDER BY updated_at DESC LIMIT 1`,
        [userId]
      );
      if (!caseRows.rows.length) {
        return {
          has_case: false,
          message: "No active D.D. case. Call create_dd_case first.",
        };
      }
      const ddCase = caseRows.rows[0];
      const steps: any[] = Array.isArray(ddCase.steps) ? ddCase.steps : [];
      const nextIncomplete = steps.find((s: any) => !s.completed);
      if (!nextIncomplete) {
        return {
          all_done: true,
          total_steps: steps.length,
          message: `All ${steps.length} formation steps are complete for this ${ddCase.business_type || "business"} in ${ddCase.state || "your state"}.`,
        };
      }
      return {
        step: nextIncomplete,
        step_index: steps.indexOf(nextIncomplete),
        total_steps: steps.length,
        is_required: nextIncomplete.required,
        message: `Next step: "${nextIncomplete.label}" — ${nextIncomplete.description}${nextIncomplete.cost ? ` (Cost: ${nextIncomplete.cost})` : ""}${nextIncomplete.url ? ` Official link: ${nextIncomplete.url}` : ""}`,
      };
    }

    case "mark_dd_step_complete": {
      if (!userId) {
        return { error: "Authentication required.", requires_auth: true };
      }
      const { case_id: caseId, step_id: stepId } = args;
      if (!caseId) return { error: "case_id is required." };
      const caseRows = await pool.query(
        `SELECT * FROM dd_cases WHERE id = $1 AND user_id = $2`,
        [caseId, userId]
      );
      if (!caseRows.rows.length) {
        return { error: "Case not found or access denied." };
      }
      const ddCase = caseRows.rows[0];
      const steps: any[] = Array.isArray(ddCase.steps) ? [...ddCase.steps] : [];
      // Mark target step
      let targetIdx = stepId ? steps.findIndex((s: any) => s.id === stepId) : ddCase.step_index;
      if (targetIdx === -1) targetIdx = ddCase.step_index;
      if (targetIdx >= 0 && targetIdx < steps.length) {
        steps[targetIdx] = { ...steps[targetIdx], completed: true };
      }
      // Advance to next incomplete
      let newStepIndex = steps.length;
      for (let i = 0; i < steps.length; i++) {
        if (!steps[i].completed) { newStepIndex = i; break; }
      }
      const allDone = newStepIndex >= steps.length;
      await pool.query(
        `UPDATE dd_cases SET step_index = $1, steps = $2::jsonb, status = $3, updated_at = NOW() WHERE id = $4`,
        [Math.min(newStepIndex, steps.length), JSON.stringify(steps), allDone ? "completed" : "active", caseId]
      );
      const nextStep = allDone ? null : steps[newStepIndex];
      return {
        success: true,
        case_id: caseId,
        step_index: newStepIndex,
        total_steps: steps.length,
        all_done: allDone,
        next_step: nextStep,
        message: allDone
          ? `All ${steps.length} formation steps complete. ${ddCase.business_type || "Business"} formation in ${ddCase.state || "your state"} is fully tracked.`
          : `Step marked complete. Next: "${nextStep?.label}" (step ${newStepIndex + 1}/${steps.length}).`,
      };
    }

    case "resume_dd_case": {
      if (!userId) {
        return { error: "Authentication required.", requires_auth: true };
      }
      // Enforce paid-feature gate — same as REST and routes-JAC paths
      const unlockRow = await pool.query(
        `SELECT dd_launch_unlocked FROM users WHERE id = $1`,
        [userId]
      );
      if (!unlockRow.rows.length || !unlockRow.rows[0].dd_launch_unlocked) {
        return {
          error: "D.D. Business Launch is not unlocked for this account.",
          action: "navigate",
          route: "/dd",
          message: "Navigating to /dd — they'll see the $9.99 unlock screen.",
        };
      }
      const { case_id: resumeCaseId } = args;
      if (!resumeCaseId) return { error: "case_id is required." };
      const resumeRows = await pool.query(
        `SELECT * FROM dd_cases WHERE id = $1 AND user_id = $2`,
        [resumeCaseId, userId]
      );
      if (!resumeRows.rows.length) {
        return { error: "Case not found or access denied." };
      }
      const resumeCase = resumeRows.rows[0];
      if (resumeCase.status === "completed") {
        return { error: "Cannot resume a completed case." };
      }
      // Advisory lock + atomic swap: serializes per-user case activation
      const resumeClient = await pool.connect();
      try {
        await resumeClient.query("BEGIN");
        await resumeClient.query(`SELECT pg_advisory_xact_lock($1)`, [userId]);
        await resumeClient.query(
          `UPDATE dd_cases SET status = 'paused', updated_at = NOW() WHERE user_id = $1 AND status = 'active' AND id != $2`,
          [userId, resumeCaseId]
        );
        await resumeClient.query(
          `UPDATE dd_cases SET status = 'active', updated_at = NOW() WHERE id = $1`,
          [resumeCaseId]
        );
        await resumeClient.query("COMMIT");
      } catch (txErr) {
        await resumeClient.query("ROLLBACK");
        throw txErr;
      } finally {
        resumeClient.release();
      }
      const resumeSteps: any[] = Array.isArray(resumeCase.steps) ? resumeCase.steps : [];
      const resumeCurrentStep = resumeSteps[resumeCase.step_index] || null;
      return {
        success: true,
        case_id: resumeCaseId,
        business_type: resumeCase.business_type,
        business_name: resumeCase.business_name,
        state: resumeCase.state,
        step_index: resumeCase.step_index,
        total_steps: resumeSteps.length,
        current_step: resumeCurrentStep,
        action: "navigate",
        route: "/dd",
        message: resumeCurrentStep
          ? `Resumed ${resumeCase.business_type || "business"} case in ${resumeCase.state || "your state"}. Back on step ${resumeCase.step_index + 1}/${resumeSteps.length}: "${resumeCurrentStep.label}". Opening D.D. now.`
          : `Resumed D.D. case. Opening D.D. now.`,
      };
    }

    case "return_from_dd_to_jac": {
      return {
        action: "navigate",
        route: "/",
        message: "Returning to JAC. D.D. progress is saved — the user can come back to /dd at any time to continue.",
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
