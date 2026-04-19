import { describe, it, expect, beforeEach, vi } from "vitest";

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
process.env.STRIPE_CONNECT_SECRET_KEY = process.env.STRIPE_CONNECT_SECRET_KEY || "sk_test_dummy";
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "test-secret";
process.env.NODE_ENV = "test";

import express, { type Express } from "express";
import { createServer } from "http";
import session from "express-session";
import supertest from "supertest";
import { hashPassword } from "../auth";

interface StoreUser {
  id: number;
  email: string;
  username: string;
  fullName: string;
  password: string;
  authProvider: string | null;
  banned: boolean;
  suspended: boolean;
  guberId: string | null;
  referralCode: string | null;
  accountType: string | null;
  role: string | null;
  tier: string | null;
  termsAcceptedAt: Date | null;
  day1OG: boolean;
}

interface BusinessProfileRecord {
  id: number;
  userId: number;
  companyName: string;
  ein?: string;
  legalBusinessName?: string;
  industry: string | null;
  contactPhone: string | null;
  billingEmail?: string | null;
  description?: string | null;
}

interface BusinessAccountRecord {
  id: number;
  ownerUserId: number;
  businessName: string;
  workEmail: string;
  phone: string | null;
  industry: string;
  companyNeedsSummary: string | null;
  status: string;
}

interface LegalAcceptanceRecord {
  id: number;
  actorType: string;
  actorId: number;
  documentType: string;
  documentVersion: string;
  ipAddress: string | null;
  userAgent: string | null;
}

interface NotificationRecord {
  id: number;
  userId: number;
  title: string;
  body: string;
  type: string;
  jobId: number | null;
}

type StoreUserInput = Partial<Omit<StoreUser, "id">> & {
  email: string;
  username: string;
  fullName: string;
  password: string;
};

interface MockState {
  users: StoreUser[];
  businessProfiles: BusinessProfileRecord[];
  businessAccounts: BusinessAccountRecord[];
  legalAcceptances: LegalAcceptanceRecord[];
  notifications: NotificationRecord[];
  nextUserId: number;
  nextBpId: number;
  nextBaId: number;
  nextLaId: number;
  nextNotifId: number;
  reset(): void;
}

const mockState = vi.hoisted<MockState>(() => {
  const state: MockState = {
    users: [],
    businessProfiles: [],
    businessAccounts: [],
    legalAcceptances: [],
    notifications: [],
    nextUserId: 1,
    nextBpId: 1,
    nextBaId: 1,
    nextLaId: 1,
    nextNotifId: 1,
    reset() {
      state.users = [];
      state.businessProfiles = [];
      state.businessAccounts = [];
      state.legalAcceptances = [];
      state.notifications = [];
      state.nextUserId = 1;
      state.nextBpId = 1;
      state.nextBaId = 1;
      state.nextLaId = 1;
      state.nextNotifId = 1;
    },
  };
  return state;
});

vi.mock("../db", () => {
  return {
    pool: {},
    db: {
      execute: vi.fn(async () => ({ rows: [] as unknown[] })),
    },
  };
});

vi.mock("connect-pg-simple", async () => {
  const sessionMod = await import("express-session");
  type StoreCallback = (err: unknown, data?: session.SessionData | null) => void;
  type SetCallback = (err?: unknown) => void;
  class MemStore extends sessionMod.default.Store {
    private sessions = new Map<string, string>();
    get(sid: string, cb: StoreCallback) {
      const v = this.sessions.get(sid);
      cb(null, v ? (JSON.parse(v) as session.SessionData) : null);
    }
    set(sid: string, data: session.SessionData, cb: SetCallback) {
      this.sessions.set(sid, JSON.stringify(data));
      cb();
    }
    destroy(sid: string, cb: SetCallback) {
      this.sessions.delete(sid);
      cb();
    }
    touch(_sid: string, _data: session.SessionData, cb: SetCallback) {
      cb();
    }
  }
  return { default: () => MemStore };
});

vi.mock("../push", () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
  saveSubscription: vi.fn().mockResolvedValue(undefined),
  removeSubscription: vi.fn().mockResolvedValue(undefined),
  VAPID_PUBLIC_KEY: "test-vapid-key",
}));

vi.mock("../oauth", () => ({
  handleGoogleAuthStart: vi.fn(),
  validateOAuthState: vi.fn(),
}));

vi.mock("../demo-guard", () => {
  type Next = (err?: unknown) => void;
  return {
    demoGuard: (_req: unknown, _res: unknown, next: Next) => next(),
    getDemoUserIds: () => [] as number[],
    isDemoUser: () => false,
  };
});

vi.mock("../notify-helpers", () => ({
  notifyNearbyAvailableWorkers: vi.fn(),
}));

vi.mock("../game-images", () => ({ ALL_GAME_IMAGES: [] as string[] }));

interface MockStorage {
  getUserByEmail(email: string): Promise<StoreUser | undefined>;
  getUserByUsername(username: string): Promise<StoreUser | undefined>;
  getUserByGuberId(guberId: string): Promise<StoreUser | undefined>;
  getUser(id: number): Promise<StoreUser | undefined>;
  createUser(data: StoreUserInput): Promise<StoreUser>;
  updateUser(id: number, data: Partial<StoreUser>): Promise<StoreUser | undefined>;
  createBusinessProfile(data: Omit<BusinessProfileRecord, "id">): Promise<BusinessProfileRecord>;
  createBusinessAccount(data: Omit<BusinessAccountRecord, "id">): Promise<BusinessAccountRecord>;
  createLegalAcceptance(data: Omit<LegalAcceptanceRecord, "id">): Promise<LegalAcceptanceRecord>;
  createNotification(data: Omit<NotificationRecord, "id">): Promise<NotificationRecord>;
  getBusinessAccount(): Promise<undefined>;
  getBusinessPlan(): Promise<undefined>;
}

vi.mock("../storage", () => {
  const storage: MockStorage = {
    async getUserByEmail(email) {
      return mockState.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    },
    async getUserByUsername(username) {
      return mockState.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    },
    async getUserByGuberId(guberId) {
      return mockState.users.find((u) => u.guberId === guberId);
    },
    async getUser(id) {
      return mockState.users.find((u) => u.id === id);
    },
    async createUser(data) {
      const user: StoreUser = {
        id: mockState.nextUserId++,
        email: data.email,
        username: data.username,
        fullName: data.fullName,
        password: data.password,
        authProvider: data.authProvider ?? null,
        banned: data.banned ?? false,
        suspended: data.suspended ?? false,
        guberId: data.guberId ?? null,
        referralCode: data.referralCode ?? null,
        accountType: data.accountType ?? null,
        role: data.role ?? null,
        tier: data.tier ?? null,
        termsAcceptedAt: data.termsAcceptedAt ?? null,
        day1OG: data.day1OG ?? false,
      };
      mockState.users.push(user);
      return user;
    },
    async updateUser(id, data) {
      const u = mockState.users.find((x) => x.id === id);
      if (!u) return undefined;
      Object.assign(u, data);
      return u;
    },
    async createBusinessProfile(data) {
      const bp: BusinessProfileRecord = { id: mockState.nextBpId++, ...data };
      mockState.businessProfiles.push(bp);
      return bp;
    },
    async createBusinessAccount(data) {
      const ba: BusinessAccountRecord = { id: mockState.nextBaId++, ...data };
      mockState.businessAccounts.push(ba);
      return ba;
    },
    async createLegalAcceptance(data) {
      const la: LegalAcceptanceRecord = { id: mockState.nextLaId++, ...data };
      mockState.legalAcceptances.push(la);
      return la;
    },
    async createNotification(data) {
      const n: NotificationRecord = { id: mockState.nextNotifId++, ...data };
      mockState.notifications.push(n);
      return n;
    },
    async getBusinessAccount() {
      return undefined;
    },
    async getBusinessPlan() {
      return undefined;
    },
  };
  return { storage };
});

interface MockFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

const stubFetch = (): MockFetchResponse => ({
  ok: false,
  status: 503,
  json: async () => ({}),
  text: async () => "",
});

beforeEach(() => {
  globalThis.fetch = vi.fn<typeof fetch>(async () => stubFetch() as unknown as Response);
});

let appInstance: Express | null = null;

async function getApp(): Promise<Express> {
  if (appInstance) return appInstance;
  const { registerRoutes } = await import("../routes");
  const app = express();
  app.use(express.json({ limit: "20mb" }));
  app.use(express.urlencoded({ extended: true, limit: "20mb" }));
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  appInstance = app;
  return app;
}

function setCookies(res: supertest.Response): string[] {
  const raw = res.headers["set-cookie"];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

const VALID_BUSINESS_SIGNUP = {
  ein: "123456789",
  legalBusinessName: "Acme Corporation",
  email: "owner@acme.example",
  username: "acmeowner",
  fullName: "Owner Person",
  password: "StrongPass!1",
  industry: "Construction",
  contactPhone: "+15555550100",
  billingEmail: "billing@acme.example",
  description: "We do things.",
};

const VALID_ACCESS_REQUEST = {
  businessName: "Beta Inc",
  workEmail: "ceo@beta.example",
  phone: "+15555550199",
  industry: "Tech",
  companyNeedsSummary: "Need helpers",
  fullName: "Beta Boss",
  username: "betaboss",
  password: "StrongPass!1",
};

describe("POST /api/auth/business-signup", () => {
  beforeEach(() => {
    mockState.reset();
  });

  it("creates a business user and a business profile with EIN", async () => {
    const app = await getApp();
    const res = await supertest(app)
      .post("/api/auth/business-signup")
      .send(VALID_BUSINESS_SIGNUP)
      .expect(201);

    expect(res.body).toHaveProperty("id");
    expect(res.body.email).toBe(VALID_BUSINESS_SIGNUP.email);
    expect(res.body).not.toHaveProperty("password");

    expect(mockState.users).toHaveLength(1);
    const user = mockState.users[0];
    expect(user.accountType).toBe("business");
    expect(user.password).not.toBe(VALID_BUSINESS_SIGNUP.password);

    expect(mockState.businessProfiles).toHaveLength(1);
    const bp = mockState.businessProfiles[0];
    expect(bp.ein).toBe("123456789");
    expect(bp.legalBusinessName).toBe("Acme Corporation");
    expect(bp.userId).toBe(user.id);
  });

  it("rejects EIN that is not exactly 9 digits", async () => {
    const app = await getApp();
    const res = await supertest(app)
      .post("/api/auth/business-signup")
      .send({ ...VALID_BUSINESS_SIGNUP, ein: "12345" })
      .expect(400);
    expect(res.body.message).toContain("9 digits");
  });

  it("rejects EIN with non-numeric characters", async () => {
    const app = await getApp();
    const res = await supertest(app)
      .post("/api/auth/business-signup")
      .send({ ...VALID_BUSINESS_SIGNUP, ein: "12345abcd" })
      .expect(400);
    expect(res.body.message).toContain("9 digits");
  });

  it("rejects missing legal business name", async () => {
    const app = await getApp();
    const res = await supertest(app)
      .post("/api/auth/business-signup")
      .send({ ...VALID_BUSINESS_SIGNUP, legalBusinessName: "" })
      .expect(400);
    expect(res.body.message).toBeDefined();
  });

  it("rejects weak password", async () => {
    const app = await getApp();
    const res = await supertest(app)
      .post("/api/auth/business-signup")
      .send({ ...VALID_BUSINESS_SIGNUP, password: "weakpass" })
      .expect(400);
    expect(res.body.message).toBeDefined();
  });

  it("rejects contact info embedded in fullName", async () => {
    const app = await getApp();
    const res = await supertest(app)
      .post("/api/auth/business-signup")
      .send({ ...VALID_BUSINESS_SIGNUP, fullName: "Owner 555-123-4567" })
      .expect(400);
    expect(res.body.message).toBe("Contact info not allowed in names");
  });

  it("rejects duplicate email", async () => {
    const app = await getApp();
    await supertest(app)
      .post("/api/auth/business-signup")
      .send(VALID_BUSINESS_SIGNUP)
      .expect(201);
    const res = await supertest(app)
      .post("/api/auth/business-signup")
      .send({ ...VALID_BUSINESS_SIGNUP, username: "different" })
      .expect(400);
    expect(res.body.message).toBe("Email already in use");
  });

  it("rejects duplicate username", async () => {
    const app = await getApp();
    await supertest(app)
      .post("/api/auth/business-signup")
      .send(VALID_BUSINESS_SIGNUP)
      .expect(201);
    const res = await supertest(app)
      .post("/api/auth/business-signup")
      .send({ ...VALID_BUSINESS_SIGNUP, email: "other@acme.example" })
      .expect(400);
    expect(res.body.message).toBe("Username already taken");
  });

  it("sets a session cookie after successful signup", async () => {
    const app = await getApp();
    const res = await supertest(app)
      .post("/api/auth/business-signup")
      .send(VALID_BUSINESS_SIGNUP)
      .expect(201);
    const cookies = setCookies(res);
    expect(cookies.some((c) => c.includes("connect.sid"))).toBe(true);
  });

  it("creates a welcome notification for the new business user", async () => {
    const app = await getApp();
    await supertest(app)
      .post("/api/auth/business-signup")
      .send(VALID_BUSINESS_SIGNUP)
      .expect(201);
    expect(mockState.notifications).toHaveLength(1);
    expect(mockState.notifications[0].title).toContain("Welcome");
  });
});

describe("POST /api/auth/business-access-request", () => {
  beforeEach(() => {
    mockState.reset();
  });

  it("creates a pending business account and a business profile", async () => {
    const app = await getApp();
    const res = await supertest(app)
      .post("/api/auth/business-access-request")
      .send(VALID_ACCESS_REQUEST)
      .expect(201);

    expect(res.body).toHaveProperty("user");
    expect(res.body).toHaveProperty("businessAccount");
    expect(res.body.user.email).toBe(VALID_ACCESS_REQUEST.workEmail);
    expect(res.body.user).not.toHaveProperty("password");

    expect(mockState.businessAccounts).toHaveLength(1);
    const ba = mockState.businessAccounts[0];
    expect(ba.status).toBe("pending_business");
    expect(ba.businessName).toBe("Beta Inc");
    expect(ba.workEmail).toBe(VALID_ACCESS_REQUEST.workEmail);

    expect(mockState.businessProfiles).toHaveLength(1);
  });

  it("records a legal acceptance entry", async () => {
    const app = await getApp();
    await supertest(app)
      .post("/api/auth/business-access-request")
      .send(VALID_ACCESS_REQUEST)
      .expect(201);
    expect(mockState.legalAcceptances).toHaveLength(1);
    const la = mockState.legalAcceptances[0];
    expect(la.actorType).toBe("business");
    expect(la.documentType).toBe("business_terms");
  });

  it("rejects missing industry", async () => {
    const app = await getApp();
    const { industry: _omit, ...rest } = VALID_ACCESS_REQUEST;
    const res = await supertest(app)
      .post("/api/auth/business-access-request")
      .send(rest)
      .expect(400);
    expect(res.body.message).toBeDefined();
  });

  it("rejects invalid work email", async () => {
    const app = await getApp();
    const res = await supertest(app)
      .post("/api/auth/business-access-request")
      .send({ ...VALID_ACCESS_REQUEST, workEmail: "not-an-email" })
      .expect(400);
    expect(res.body.message).toBeDefined();
  });

  it("rejects weak password", async () => {
    const app = await getApp();
    const res = await supertest(app)
      .post("/api/auth/business-access-request")
      .send({ ...VALID_ACCESS_REQUEST, password: "Short!1" })
      .expect(400);
    expect(res.body.message).toBeDefined();
  });

  it("rejects duplicate email", async () => {
    const app = await getApp();
    await supertest(app)
      .post("/api/auth/business-access-request")
      .send(VALID_ACCESS_REQUEST)
      .expect(201);
    const res = await supertest(app)
      .post("/api/auth/business-access-request")
      .send({ ...VALID_ACCESS_REQUEST, username: "different" })
      .expect(400);
    expect(res.body.message).toBe("Email already in use");
  });

  it("rejects duplicate username", async () => {
    const app = await getApp();
    await supertest(app)
      .post("/api/auth/business-access-request")
      .send(VALID_ACCESS_REQUEST)
      .expect(201);
    const res = await supertest(app)
      .post("/api/auth/business-access-request")
      .send({ ...VALID_ACCESS_REQUEST, workEmail: "other@beta.example" })
      .expect(400);
    expect(res.body.message).toBe("Username already taken");
  });

  it("sets a session cookie after successful request", async () => {
    const app = await getApp();
    const res = await supertest(app)
      .post("/api/auth/business-access-request")
      .send(VALID_ACCESS_REQUEST)
      .expect(201);
    const cookies = setCookies(res);
    expect(cookies.some((c) => c.includes("connect.sid"))).toBe(true);
  });
});

async function seedUser(input: {
  email: string;
  username: string;
  fullName: string;
  password: string;
  authProvider?: string;
}): Promise<StoreUser> {
  const { storage } = (await import("../storage")) as unknown as { storage: MockStorage };
  return storage.createUser(input);
}

describe("POST /api/auth/change-password", () => {
  let agent: ReturnType<typeof supertest.agent>;
  const userPassword = "OriginalPass!1";

  beforeEach(async () => {
    mockState.reset();
    const app = await getApp();
    const hashed = await hashPassword(userPassword);
    await seedUser({
      email: "changepw@example.com",
      username: "changepwuser",
      fullName: "Change User",
      password: hashed,
    });
    agent = supertest.agent(app);
  });

  function loginAgent(password: string) {
    return agent
      .post("/api/auth/login")
      .send({ email: "changepw@example.com", password });
  }

  it("rejects unauthenticated requests with 401", async () => {
    const app = await getApp();
    const res = await supertest(app)
      .post("/api/auth/change-password")
      .send({ currentPassword: userPassword, newPassword: "BrandNew!1" })
      .expect(401);
    expect(res.body.message).toBe("Unauthorized");
  });

  it("requires both currentPassword and newPassword", async () => {
    await loginAgent(userPassword).expect(200);
    const res = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: userPassword })
      .expect(400);
    expect(res.body.message).toBe("Current and new password required");
  });

  it("rejects a weak new password", async () => {
    await loginAgent(userPassword).expect(200);
    const res = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: userPassword, newPassword: "weak" })
      .expect(400);
    expect(res.body.message).toContain("8 characters");
  });

  it("rejects when currentPassword is incorrect", async () => {
    await loginAgent(userPassword).expect(200);
    const res = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: "WrongPass!1", newPassword: "BrandNew!1" })
      .expect(401);
    expect(res.body.message).toBe("Current password is incorrect");
  });

  it("rejects Google-provider accounts from setting a password", async () => {
    const hashed = await hashPassword(userPassword);
    await seedUser({
      email: "googler@example.com",
      username: "googler",
      fullName: "Google User",
      password: hashed,
      authProvider: "google",
    });
    const app = await getApp();
    const googleAgent = supertest.agent(app);
    await googleAgent
      .post("/api/auth/login")
      .send({ email: "googler@example.com", password: userPassword })
      .expect(200);

    const res = await googleAgent
      .post("/api/auth/change-password")
      .send({ currentPassword: userPassword, newPassword: "BrandNew!1" })
      .expect(400);
    expect(res.body.message).toBe("Google accounts cannot set a password");
  });

  it("changes the password and allows login with the new password", async () => {
    await loginAgent(userPassword).expect(200);
    const newPassword = "FreshPass!2";
    const res = await agent
      .post("/api/auth/change-password")
      .send({ currentPassword: userPassword, newPassword })
      .expect(200);
    expect(res.body.message).toBe("Password updated successfully");

    const app = await getApp();
    const loginAfter = supertest.agent(app);
    await loginAfter
      .post("/api/auth/login")
      .send({ email: "changepw@example.com", password: newPassword })
      .expect(200);

    await loginAfter
      .post("/api/auth/login")
      .send({ email: "changepw@example.com", password: userPassword })
      .expect(401);
  });
});
