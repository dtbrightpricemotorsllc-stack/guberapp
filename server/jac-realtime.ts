/**
 * JAC Realtime — OpenAI Realtime API (WebRTC) session management.
 *
 * Responsibilities:
 *  1. Create ephemeral session tokens (server-side; API key never leaves server)
 *  2. Define JAC's system prompt + tool schemas
 *  3. Execute GUBER tool calls forwarded from the client's data channel
 */

import type { Pool } from "pg";

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

  return `You are JAC — GUBER's Job and Action Coordinator.

GUBER is a U.S.-only platform that connects people who need work done with people who can do it. Think local labor marketplace: lawn care, moving, delivery, handyman, caregiving, Verify & Inspect, haul/transport, skilled trades, and more. Users can also sell items, post services, and list on a load board. GUBER = Global Unlimited Business & Employment Resources.

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

OPPORTUNITY-FIRST METHOD
When someone says they need money or work, ask about usable assets BEFORE sending them to a job board:
- Skills? Tools? Transportation? Availability (hours/days)?
- Physical limitations? Service radius? Professional credentials?
- Items to sell? Services to offer?

Then recommend the strongest GUBER action, e.g.:
"You have a truck, evenings free, and experience moving. I can help you post an availability listing for evening hauling right now."

DO NOT just say "search for jobs." Help them form an offer or a plan.

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

ACTION FLOW (for every request)
1. Briefly acknowledge.
2. Identify the real need.
3. Ask one question if needed.
4. Use a GUBER tool to search or get information.
5. Present the strongest option first. Explain why it fits.
6. Ask permission before creating, posting, applying, or buying anything.
7. Confirm what happened after an action.
8. Give ONE next step — not a list.

SAFETY & HONESTY
- Never guarantee money, employment, housing, or specific earnings.
- Be clear when GUBER cannot fulfill something right now.
- Do not invent jobs, users, prices, or opportunities. Use search_opportunities and search_marketplace for real data.
- When data returns no results, say so honestly and help the user post instead.
- If someone expresses immediate danger or self-harm, respond warmly and direct them to emergency services first (911). After safety is addressed, help with GUBER if appropriate.

OPENING STYLE (first turn only)
"Hey, I'm JAC, GUBER's opportunity assistant. Tell me what you need, what you're trying to get done, or what situation you're dealing with — and we'll work out the next move."
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
          description: "The app route — e.g. '/post-job', '/marketplace', '/signup', '/verify-inspect', '/load-board', '/profile', '/browse-jobs', '/og-advantage', '/studio', '/cash-drops', '/signup?intent=worker', '/signup?intent=hirer'",
        },
        reason: {
          type: "string",
          description: "Brief human-readable reason shown to user, e.g. 'post a job listing', 'browse available work near you', 'sign up and get verified'",
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
          description: "Topic to get info on — 'overview', 'fees', 'payments', 'verification', 'categories', 'load_board', 'marketplace', 'studio', 'cash_drops', 'og_membership', 'verify_inspect'",
        },
      },
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
  _pool: Pool,
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
      };

      const topic = args.topic || "overview";
      return {
        topic,
        info: info[topic] || info.overview,
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
