import request from "supertest";
import { prisma } from "../db/prisma";
import { app } from "../app";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "LedgerEntry",
      "Account",
      "Ledger",
      "RefreshToken",
      "User"
    RESTART IDENTITY CASCADE;
  `);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function register(email: string, password = "password123") {
  return request(app).post("/auth/register").send({ email, password });
}

async function login(email: string, password = "password123") {
  return request(app).post("/auth/login").send({ email, password });
}

async function authToken(email: string) {
  await register(email);
  const res = await login(email);
  expect(res.status).toBe(200);
  expect(typeof res.body.accessToken).toBe("string");
  return res.body.accessToken as string;
}

async function createLedger(token: string, name: string) {
  return request(app)
    .post("/auth/ledger")
    .set("Authorization", `Bearer ${token}`)
    .send({ name });
}

async function selectLedger(token: string, ledgerId: string) {
  return request(app)
    .post(`/auth/ledgers/${ledgerId}/select`)
    .set("Authorization", `Bearer ${token}`);
}

async function createAccount(token: string, payload: { name: string; type: string }) {
  return request(app)
    .post("/auth/accounts")
    .set("Authorization", `Bearer ${token}`)
    .send(payload);
}

async function listAccounts(token: string) {
  return request(app)
    .get("/auth/accounts")
    .set("Authorization", `Bearer ${token}`);
}

describe("Task D2 - Accounts (creation + isolation)", () => {
  test("Test A — requires active ledger: POST /accounts -> 409", async () => {
    const token = await authToken(`a_${Date.now()}@test.com`);

    const res = await createAccount(token, { name: "Cash", type: "ASSET" });
    expect(res.status).toBe(409);
  });

  test("Test B — create + list accounts in active ledger", async () => {
    const token = await authToken(`b_${Date.now()}@test.com`);

    const ledger = await createLedger(token, "Main");
    expect(ledger.status).toBe(201);

    const sel = await selectLedger(token, ledger.body.id);
    expect(sel.status).toBe(200);

    const created = await createAccount(token, { name: "Cash", type: "ASSET" });
    expect(created.status).toBe(201);
    expect(created.body).toHaveProperty("id");
    expect(created.body.name).toBe("Cash");
    expect(created.body.type).toBe("ASSET");
    expect(created.body.ledgerId).toBe(ledger.body.id);

    const listed = await listAccounts(token);
    expect(listed.status).toBe(200);
    expect(Array.isArray(listed.body)).toBe(true);
    expect(listed.body.length).toBe(1);
    expect(listed.body[0].name).toBe("Cash");
    expect(listed.body[0].type).toBe("ASSET");
    expect(listed.body[0].ledgerId).toBe(ledger.body.id);
  });

  test("Test C — unique name per ledger: duplicate -> 409", async () => {
    const token = await authToken(`c_${Date.now()}@test.com`);

    const ledger = await createLedger(token, "Main");
    expect(ledger.status).toBe(201);

    const sel = await selectLedger(token, ledger.body.id);
    expect(sel.status).toBe(200);

    const first = await createAccount(token, { name: "Cash", type: "ASSET" });
    expect(first.status).toBe(201);

    const dup = await createAccount(token, { name: "Cash", type: "ASSET" });
    expect(dup.status).toBe(409);
  });

  test("Test D — same name allowed in different ledger", async () => {
    const token = await authToken(`d_${Date.now()}@test.com`);

    const l1 = await createLedger(token, "L1");
    const l2 = await createLedger(token, "L2");
    expect(l1.status).toBe(201);
    expect(l2.status).toBe(201);

    const sel1 = await selectLedger(token, l1.body.id);
    expect(sel1.status).toBe(200);

    const a1 = await createAccount(token, { name: "Cash", type: "ASSET" });
    expect(a1.status).toBe(201);

    const sel2 = await selectLedger(token, l2.body.id);
    expect(sel2.status).toBe(200);

    const a2 = await createAccount(token, { name: "Cash", type: "ASSET" });
    expect(a2.status).toBe(201);
    expect(a2.body.ledgerId).toBe(l2.body.id);
  });

  test("Test E — user isolation: User B cannot see User A accounts", async () => {
    // User A
    const tokenA = await authToken(`eA_${Date.now()}@test.com`);
    const ledgerA = await createLedger(tokenA, "A Ledger");
    expect(ledgerA.status).toBe(201);
    const selA = await selectLedger(tokenA, ledgerA.body.id);
    expect(selA.status).toBe(200);

    const accA = await createAccount(tokenA, { name: "Cash", type: "ASSET" });
    expect(accA.status).toBe(201);

    // User B
    const tokenB = await authToken(`eB_${Date.now()}@test.com`);
    const ledgerB = await createLedger(tokenB, "B Ledger");
    expect(ledgerB.status).toBe(201);
    const selB = await selectLedger(tokenB, ledgerB.body.id);
    expect(selB.status).toBe(200);

    const listB = await listAccounts(tokenB);
    expect(listB.status).toBe(200);
    expect(Array.isArray(listB.body)).toBe(true);
    expect(listB.body).toEqual([]);
  });
});
