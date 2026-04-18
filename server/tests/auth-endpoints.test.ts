import { describe, it, expect, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import supertest from "supertest";
import { randomBytes } from "crypto";
import {
  validatePasswordStrength,
  hashPassword,
  comparePasswords,
  filterContactInfo,
  sanitizeUser,
  handleLogin,
  handleSignup,
  handleForgotPassword,
  handleResetPassword,
  handleMe,
  handleLogout,
  type AuthStorage,
} from "../auth";

interface MockUser {
  id: number;
  email: string;
  username: string;
  fullName: string;
  password: string;
  authProvider?: string;
  banned?: boolean;
  suspended?: boolean;
}

interface MockResetToken {
  userId: number;
  token: string;
  expiresAt: Date;
  used: boolean;
}

function createMockStorage(): AuthStorage & {
  reset(): void;
  getUsers(): MockUser[];
} {
  let users: MockUser[] = [];
  let resetTokens: MockResetToken[] = [];
  let nextId = 1;

  return {
    reset() {
      users = [];
      resetTokens = [];
      nextId = 1;
    },
    getUsers() {
      return users;
    },
    async getUserByEmail(email: string) {
      return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    },
    async getUserByUsername(username: string) {
      return users.find(
        (u) => u.username.toLowerCase() === username.toLowerCase()
      );
    },
    async createUser(data: Partial<MockUser>) {
      const user: MockUser = {
        id: nextId++,
        email: data.email!,
        username: data.username!,
        fullName: data.fullName!,
        password: data.password!,
        authProvider: data.authProvider,
        banned: data.banned ?? false,
        suspended: data.suspended ?? false,
      };
      users.push(user);
      return user;
    },
    async getUser(id: number) {
      return users.find((u) => u.id === id);
    },
    async updateUser(id: number, data: Partial<MockUser>) {
      const user = users.find((u) => u.id === id);
      if (!user) return undefined;
      Object.assign(user, data);
      return user;
    },
    async createPasswordResetToken(
      userId: number,
      token: string,
      expiresAt: Date
    ) {
      resetTokens.push({ userId, token, expiresAt, used: false });
    },
    async getPasswordResetToken(token: string) {
      return resetTokens.find((t) => t.token === token);
    },
    async invalidatePasswordResetToken(token: string) {
      const t = resetTokens.find((rt) => rt.token === token);
      if (t) t.used = true;
    },
  };
}

function buildTestApp(mockStorage: ReturnType<typeof createMockStorage>) {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    })
  );

  app.post("/api/auth/signup", handleSignup(mockStorage));
  app.post("/api/auth/login", handleLogin(mockStorage));
  app.post("/api/auth/forgot-password", handleForgotPassword(mockStorage));
  app.post("/api/auth/reset-password", handleResetPassword(mockStorage));
  app.get("/api/auth/me", handleMe(mockStorage));
  app.post("/api/auth/logout", handleLogout());

  return app;
}

const VALID_PASSWORD = "StrongPass!1";
const VALID_SIGNUP = {
  email: "test@example.com",
  username: "testuser",
  fullName: "Test User",
  password: VALID_PASSWORD,
};

describe("Auth utility functions (production module)", () => {
  describe("validatePasswordStrength", () => {
    it("should accept a strong password", () => {
      expect(validatePasswordStrength("StrongPass!1")).toBeNull();
    });

    it("should reject password shorter than 8 characters", () => {
      expect(validatePasswordStrength("Short!")).toContain("8 characters");
    });

    it("should reject password without capital letter", () => {
      expect(validatePasswordStrength("alllowercase1!")).toContain(
        "capital letter"
      );
    });

    it("should reject password without symbol", () => {
      expect(validatePasswordStrength("NoSymbol123")).toContain("symbol");
    });
  });

  describe("hashPassword / comparePasswords", () => {
    it("should hash a password and verify it correctly", async () => {
      const hashed = await hashPassword("MySecure!1");
      expect(hashed).toContain(".");
      expect(hashed).not.toBe("MySecure!1");
      expect(await comparePasswords("MySecure!1", hashed)).toBe(true);
    });

    it("should reject wrong password", async () => {
      const hashed = await hashPassword("MySecure!1");
      expect(await comparePasswords("WrongPass!1", hashed)).toBe(false);
    });

    it("should produce different hashes for the same password (unique salts)", async () => {
      const h1 = await hashPassword("SamePass!1");
      const h2 = await hashPassword("SamePass!1");
      expect(h1).not.toBe(h2);
    });
  });

  describe("filterContactInfo", () => {
    it("should allow normal names", () => {
      const result = filterContactInfo("John Smith");
      expect(result.blocked).toBe(false);
    });

    it("should block phone numbers", () => {
      const result = filterContactInfo("John 555-123-4567");
      expect(result.blocked).toBe(true);
    });

    it("should block email addresses", () => {
      const result = filterContactInfo("John john@example.com");
      expect(result.blocked).toBe(true);
    });

    it("should block social media handles", () => {
      const result = filterContactInfo("John @johndoe");
      expect(result.blocked).toBe(true);
    });

    it("should handle empty string", () => {
      const result = filterContactInfo("");
      expect(result.blocked).toBe(false);
    });
  });

  describe("sanitizeUser", () => {
    it("should remove password from user object", () => {
      const user = {
        id: 1,
        email: "test@test.com",
        password: "hashed.salt",
        username: "test",
      };
      const sanitized = sanitizeUser(user);
      expect(sanitized).not.toHaveProperty("password");
      expect(sanitized).toHaveProperty("email", "test@test.com");
      expect(sanitized).toHaveProperty("id", 1);
    });
  });
});

describe("POST /api/auth/signup (handleSignup)", () => {
  let app: express.Express;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
    app = buildTestApp(mockStorage);
  });

  it("should create a new user with valid data and return 201", async () => {
    const res = await supertest(app)
      .post("/api/auth/signup")
      .send(VALID_SIGNUP)
      .expect(201);

    expect(res.body).toHaveProperty("id");
    expect(res.body.email).toBe("test@example.com");
    expect(res.body.username).toBe("testuser");
    expect(res.body.fullName).toBe("Test User");
    expect(res.body).not.toHaveProperty("password");
  });

  it("should set a session cookie after signup", async () => {
    const res = await supertest(app)
      .post("/api/auth/signup")
      .send(VALID_SIGNUP)
      .expect(201);

    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.includes("connect.sid"))).toBe(true);
  });

  it("should reject missing email", async () => {
    const res = await supertest(app)
      .post("/api/auth/signup")
      .send({ ...VALID_SIGNUP, email: "" })
      .expect(400);

    expect(res.body.message).toBeDefined();
  });

  it("should reject invalid email format", async () => {
    const res = await supertest(app)
      .post("/api/auth/signup")
      .send({ ...VALID_SIGNUP, email: "not-an-email" })
      .expect(400);

    expect(res.body.message).toBeDefined();
  });

  it("should reject username shorter than 3 characters", async () => {
    const res = await supertest(app)
      .post("/api/auth/signup")
      .send({ ...VALID_SIGNUP, username: "ab" })
      .expect(400);

    expect(res.body.message).toBeDefined();
  });

  it("should reject fullName shorter than 2 characters", async () => {
    const res = await supertest(app)
      .post("/api/auth/signup")
      .send({ ...VALID_SIGNUP, fullName: "A" })
      .expect(400);

    expect(res.body.message).toBeDefined();
  });

  it("should reject password shorter than 8 characters", async () => {
    const res = await supertest(app)
      .post("/api/auth/signup")
      .send({ ...VALID_SIGNUP, password: "Short1!" })
      .expect(400);

    expect(res.body.message).toContain("8 characters");
  });

  it("should reject password without capital letter", async () => {
    const res = await supertest(app)
      .post("/api/auth/signup")
      .send({ ...VALID_SIGNUP, password: "alllowercase1!" })
      .expect(400);

    expect(res.body.message).toContain("capital letter");
  });

  it("should reject password without symbol", async () => {
    const res = await supertest(app)
      .post("/api/auth/signup")
      .send({ ...VALID_SIGNUP, password: "NoSymbol123" })
      .expect(400);

    expect(res.body.message).toContain("symbol");
  });

  it("should reject duplicate email", async () => {
    await supertest(app).post("/api/auth/signup").send(VALID_SIGNUP).expect(201);

    const res = await supertest(app)
      .post("/api/auth/signup")
      .send({ ...VALID_SIGNUP, username: "different" })
      .expect(400);

    expect(res.body.message).toBe("Email already in use");
  });

  it("should reject duplicate username", async () => {
    await supertest(app).post("/api/auth/signup").send(VALID_SIGNUP).expect(201);

    const res = await supertest(app)
      .post("/api/auth/signup")
      .send({ ...VALID_SIGNUP, email: "other@example.com" })
      .expect(400);

    expect(res.body.message).toBe("Username already taken");
  });

  it("should hash the password (not store plaintext)", async () => {
    await supertest(app).post("/api/auth/signup").send(VALID_SIGNUP).expect(201);

    const users = mockStorage.getUsers();
    expect(users[0].password).not.toBe(VALID_PASSWORD);
    expect(users[0].password).toContain(".");
  });

  it("should reject contact info in fullName", async () => {
    const res = await supertest(app)
      .post("/api/auth/signup")
      .send({ ...VALID_SIGNUP, fullName: "John 555-123-4567" })
      .expect(400);

    expect(res.body.message).toBe("Contact info not allowed in names");
  });

  it("should reject missing body entirely", async () => {
    const res = await supertest(app)
      .post("/api/auth/signup")
      .send({})
      .expect(400);

    expect(res.body.message).toBeDefined();
  });
});

describe("POST /api/auth/login (handleLogin)", () => {
  let app: express.Express;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(async () => {
    mockStorage = createMockStorage();
    app = buildTestApp(mockStorage);
    const hashed = await hashPassword(VALID_PASSWORD);
    await mockStorage.createUser({
      email: "user@example.com",
      username: "existinguser",
      fullName: "Existing User",
      password: hashed,
    });
  });

  it("should login with valid credentials and return user without password", async () => {
    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: VALID_PASSWORD })
      .expect(200);

    expect(res.body).toHaveProperty("id");
    expect(res.body.email).toBe("user@example.com");
    expect(res.body).not.toHaveProperty("password");
  });

  it("should set a session cookie after login", async () => {
    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: VALID_PASSWORD })
      .expect(200);

    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.includes("connect.sid"))).toBe(true);
  });

  it("should reject non-existent email", async () => {
    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: VALID_PASSWORD })
      .expect(401);

    expect(res.body.message).toBe("Invalid credentials");
  });

  it("should reject wrong password", async () => {
    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "WrongPass!1" })
      .expect(401);

    expect(res.body.message).toBe("Invalid credentials");
  });

  it("should reject banned user", async () => {
    await mockStorage.updateUser(1, { banned: true });

    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: VALID_PASSWORD })
      .expect(403);

    expect(res.body.message).toBe("Account permanently banned");
  });

  it("should reject suspended user", async () => {
    await mockStorage.updateUser(1, { suspended: true });

    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: VALID_PASSWORD })
      .expect(403);

    expect(res.body.message).toBe("Account suspended");
  });

  it("should prompt Google Sign-In for Google-only accounts with no password", async () => {
    await mockStorage.createUser({
      email: "google@example.com",
      username: "googleuser",
      fullName: "Google User",
      password: "no-dot-here",
      authProvider: "google",
    });

    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "google@example.com", password: "SomePass!1" })
      .expect(401);

    expect(res.body.message).toContain("Google Sign-In");
  });

  it("should give Google hint on wrong password for Google-linked account", async () => {
    const hashed = await hashPassword("CorrectPass!1");
    await mockStorage.createUser({
      email: "google2@example.com",
      username: "googleuser2",
      fullName: "Google User 2",
      password: hashed,
      authProvider: "google",
    });

    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "google2@example.com", password: "WrongPass!1" })
      .expect(401);

    expect(res.body.message).toContain("Google");
  });

  it("should reject invalid email format", async () => {
    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "not-valid", password: VALID_PASSWORD })
      .expect(400);

    expect(res.body.message).toBeDefined();
  });

  it("should reject password shorter than 6 characters (schema)", async () => {
    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "abc" })
      .expect(400);

    expect(res.body.message).toBeDefined();
  });

  it("should reject empty body", async () => {
    const res = await supertest(app)
      .post("/api/auth/login")
      .send({})
      .expect(400);

    expect(res.body.message).toBeDefined();
  });
});

describe("POST /api/auth/forgot-password (handleForgotPassword)", () => {
  let app: express.Express;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(async () => {
    mockStorage = createMockStorage();
    app = buildTestApp(mockStorage);
    const hashed = await hashPassword(VALID_PASSWORD);
    await mockStorage.createUser({
      email: "user@example.com",
      username: "existinguser",
      fullName: "Existing User",
      password: hashed,
    });
  });

  it("should return success message for existing email", async () => {
    const res = await supertest(app)
      .post("/api/auth/forgot-password")
      .send({ email: "user@example.com" })
      .expect(200);

    expect(res.body.message).toBe(
      "If that email exists, a reset link has been sent."
    );
    expect(res.body.resetUrl).toBeDefined();
    expect(res.body.resetUrl).toContain("token=");
  });

  it("should return same message for non-existent email (no info leak)", async () => {
    const res = await supertest(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.com" })
      .expect(200);

    expect(res.body.message).toBe(
      "If that email exists, a reset link has been sent."
    );
    expect(res.body.resetUrl).toBeUndefined();
  });

  it("should reject request without email", async () => {
    const res = await supertest(app)
      .post("/api/auth/forgot-password")
      .send({})
      .expect(400);

    expect(res.body.message).toBe("Email is required");
  });

  it("should create a reset token in storage", async () => {
    const res = await supertest(app)
      .post("/api/auth/forgot-password")
      .send({ email: "user@example.com" })
      .expect(200);

    const url = new URL(res.body.resetUrl);
    const token = url.searchParams.get("token")!;
    const stored = await mockStorage.getPasswordResetToken(token);
    expect(stored).toBeDefined();
    expect(stored!.userId).toBe(1);
    expect(stored!.used).toBe(false);
    expect(stored!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("should generate a token with 1 hour expiry", async () => {
    const before = Date.now();
    const res = await supertest(app)
      .post("/api/auth/forgot-password")
      .send({ email: "user@example.com" })
      .expect(200);

    const url = new URL(res.body.resetUrl);
    const token = url.searchParams.get("token")!;
    const stored = await mockStorage.getPasswordResetToken(token);
    const oneHourMs = 60 * 60 * 1000;
    expect(stored!.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + oneHourMs - 1000
    );
    expect(stored!.expiresAt.getTime()).toBeLessThanOrEqual(
      before + oneHourMs + 5000
    );
  });
});

describe("POST /api/auth/reset-password (handleResetPassword)", () => {
  let app: express.Express;
  let mockStorage: ReturnType<typeof createMockStorage>;
  let validToken: string;

  beforeEach(async () => {
    mockStorage = createMockStorage();
    app = buildTestApp(mockStorage);
    const hashed = await hashPassword(VALID_PASSWORD);
    await mockStorage.createUser({
      email: "user@example.com",
      username: "existinguser",
      fullName: "Existing User",
      password: hashed,
    });

    const forgotRes = await supertest(app)
      .post("/api/auth/forgot-password")
      .send({ email: "user@example.com" })
      .expect(200);

    const url = new URL(forgotRes.body.resetUrl);
    validToken = url.searchParams.get("token")!;
  });

  it("should reset password with valid token and strong password", async () => {
    const newPassword = "NewSecure!1";
    const res = await supertest(app)
      .post("/api/auth/reset-password")
      .send({ token: validToken, password: newPassword })
      .expect(200);

    expect(res.body.message).toBe("Password updated successfully");
  });

  it("should allow login with new password after reset", async () => {
    const newPassword = "NewSecure!1";
    await supertest(app)
      .post("/api/auth/reset-password")
      .send({ token: validToken, password: newPassword })
      .expect(200);

    const loginRes = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: newPassword })
      .expect(200);

    expect(loginRes.body.email).toBe("user@example.com");
  });

  it("should verify token validity before allowing reset", async () => {
    const stored = await mockStorage.getPasswordResetToken(validToken);
    expect(stored).toBeDefined();
    expect(stored!.used).toBe(false);
    expect(stored!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    await supertest(app)
      .post("/api/auth/reset-password")
      .send({ token: validToken, password: "NewSecure!1" })
      .expect(200);

    const after = await mockStorage.getPasswordResetToken(validToken);
    expect(after!.used).toBe(true);
  });

  it("should reject missing token", async () => {
    const res = await supertest(app)
      .post("/api/auth/reset-password")
      .send({ password: "NewSecure!1" })
      .expect(400);

    expect(res.body.message).toBe("Token and password required");
  });

  it("should reject missing password", async () => {
    const res = await supertest(app)
      .post("/api/auth/reset-password")
      .send({ token: validToken })
      .expect(400);

    expect(res.body.message).toBe("Token and password required");
  });

  it("should reject weak password", async () => {
    const res = await supertest(app)
      .post("/api/auth/reset-password")
      .send({ token: validToken, password: "weak" })
      .expect(400);

    expect(res.body.message).toContain("8 characters");
  });

  it("should reject invalid token", async () => {
    const res = await supertest(app)
      .post("/api/auth/reset-password")
      .send({ token: "nonexistent-token", password: "NewSecure!1" })
      .expect(400);

    expect(res.body.message).toBe("Invalid or expired reset link");
  });

  it("should reject already-used token", async () => {
    await supertest(app)
      .post("/api/auth/reset-password")
      .send({ token: validToken, password: "NewSecure!1" })
      .expect(200);

    const res = await supertest(app)
      .post("/api/auth/reset-password")
      .send({ token: validToken, password: "AnotherPass!1" })
      .expect(400);

    expect(res.body.message).toBe("This reset link has already been used");
  });

  it("should reject expired token", async () => {
    const expiredToken = randomBytes(32).toString("hex");
    const expiredDate = new Date(Date.now() - 1000);
    await mockStorage.createPasswordResetToken(1, expiredToken, expiredDate);

    const res = await supertest(app)
      .post("/api/auth/reset-password")
      .send({ token: expiredToken, password: "NewSecure!1" })
      .expect(400);

    expect(res.body.message).toBe("Reset link has expired");
  });

  it("should invalidate old password after reset", async () => {
    await supertest(app)
      .post("/api/auth/reset-password")
      .send({ token: validToken, password: "NewSecure!1" })
      .expect(200);

    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: VALID_PASSWORD })
      .expect(401);

    expect(res.body.message).toBe("Invalid credentials");
  });
});

describe("Session lifecycle (handleMe / handleLogout)", () => {
  let app: express.Express;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(async () => {
    mockStorage = createMockStorage();
    app = buildTestApp(mockStorage);
    const hashed = await hashPassword(VALID_PASSWORD);
    await mockStorage.createUser({
      email: "user@example.com",
      username: "existinguser",
      fullName: "Existing User",
      password: hashed,
    });
  });

  it("should return 401 for /me when not authenticated", async () => {
    const res = await supertest(app).get("/api/auth/me").expect(401);
    expect(res.body.message).toBe("Not authenticated");
  });

  it("should return user data for /me after login", async () => {
    const agent = supertest.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: VALID_PASSWORD })
      .expect(200);

    const res = await agent.get("/api/auth/me").expect(200);
    expect(res.body.email).toBe("user@example.com");
    expect(res.body).not.toHaveProperty("password");
  });

  it("should return user data for /me after signup", async () => {
    const agent = supertest.agent(app);
    await agent
      .post("/api/auth/signup")
      .send({
        email: "new@example.com",
        username: "newuser",
        fullName: "New User",
        password: VALID_PASSWORD,
      })
      .expect(201);

    const res = await agent.get("/api/auth/me").expect(200);
    expect(res.body.email).toBe("new@example.com");
  });

  it("should return 401 for /me after logout", async () => {
    const agent = supertest.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: VALID_PASSWORD })
      .expect(200);

    await agent.post("/api/auth/logout").expect(200);

    const res = await agent.get("/api/auth/me").expect(401);
    expect(res.body.message).toBe("Not authenticated");
  });

  it("should return success message on logout", async () => {
    const agent = supertest.agent(app);
    await agent
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: VALID_PASSWORD })
      .expect(200);

    const res = await agent.post("/api/auth/logout").expect(200);
    expect(res.body.message).toBe("Logged out");
  });
});

describe("Auth rate limiting (express-rate-limit)", () => {
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(async () => {
    mockStorage = createMockStorage();
    const hashed = await hashPassword(VALID_PASSWORD);
    await mockStorage.createUser({
      email: "user@example.com",
      username: "existinguser",
      fullName: "Existing User",
      password: hashed,
    });
  });

  it("should throttle login after exceeding max attempts", async () => {
    const app = express();
    app.use(express.json());

    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 3,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        message: "Too many login attempts, please try again later.",
      },
    });

    app.use("/api/auth/login", authLimiter);

    app.use(
      session({
        secret: "test-secret",
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
      })
    );

    app.post("/api/auth/login", handleLogin(mockStorage));

    for (let i = 0; i < 3; i++) {
      await supertest(app)
        .post("/api/auth/login")
        .send({ email: "user@example.com", password: "WrongPass!1" })
        .expect(401);
    }

    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: "WrongPass!1" })
      .expect(429);

    expect(res.body.message).toContain("Too many login attempts");
  });

  it("should include rate limit headers in responses", async () => {
    const app = express();
    app.use(express.json());

    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 15,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        message: "Too many login attempts, please try again later.",
      },
    });

    app.use("/api/auth/login", authLimiter);

    app.use(
      session({
        secret: "test-secret",
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
      })
    );

    app.post("/api/auth/login", handleLogin(mockStorage));

    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "user@example.com", password: VALID_PASSWORD })
      .expect(200);

    expect(res.headers["ratelimit-limit"]).toBeDefined();
    expect(res.headers["ratelimit-remaining"]).toBeDefined();
  });

  it("should throttle signup after exceeding max attempts", async () => {
    const app = express();
    app.use(express.json());

    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        message: "Too many login attempts, please try again later.",
      },
    });

    app.use("/api/auth/signup", authLimiter);

    app.use(
      session({
        secret: "test-secret",
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
      })
    );

    app.post("/api/auth/signup", handleSignup(mockStorage));

    await supertest(app)
      .post("/api/auth/signup")
      .send({ ...VALID_SIGNUP, email: "a@a.com", username: "aaa" })
      .expect(201);

    await supertest(app)
      .post("/api/auth/signup")
      .send({ ...VALID_SIGNUP, email: "b@b.com", username: "bbb" })
      .expect(201);

    const res = await supertest(app)
      .post("/api/auth/signup")
      .send({ ...VALID_SIGNUP, email: "c@c.com", username: "ccc" })
      .expect(429);

    expect(res.body.message).toContain("Too many");
  });
});

describe("Full password reset flow (end-to-end)", () => {
  let app: express.Express;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
    app = buildTestApp(mockStorage);
  });

  it("should complete signup → forgot → reset → login with new password", async () => {
    await supertest(app)
      .post("/api/auth/signup")
      .send(VALID_SIGNUP)
      .expect(201);

    const forgotRes = await supertest(app)
      .post("/api/auth/forgot-password")
      .send({ email: "test@example.com" })
      .expect(200);

    const url = new URL(forgotRes.body.resetUrl);
    const token = url.searchParams.get("token")!;

    const newPassword = "BrandNew!99";
    await supertest(app)
      .post("/api/auth/reset-password")
      .send({ token, password: newPassword })
      .expect(200);

    await supertest(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: VALID_PASSWORD })
      .expect(401);

    const loginRes = await supertest(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: newPassword })
      .expect(200);

    expect(loginRes.body.email).toBe("test@example.com");
  });

  it("should complete signup → login → logout → verify session cleared", async () => {
    const agent = supertest.agent(app);

    await agent.post("/api/auth/signup").send(VALID_SIGNUP).expect(201);

    await agent.get("/api/auth/me").expect(200);

    await agent.post("/api/auth/logout").expect(200);

    await agent.get("/api/auth/me").expect(401);

    await agent
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: VALID_PASSWORD })
      .expect(200);

    const meRes = await agent.get("/api/auth/me").expect(200);
    expect(meRes.body.email).toBe("test@example.com");
  });
});
