import request from "supertest";
import { prisma } from "../db/prisma";
import { app } from "../app";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "LedgerEntry",
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
  const res = await request(app).post("/auth/login").send({ email, password });
  return res;
}

async function authToken(email: string) {
  await register(email);
  const res = await login(email);
  expect(res.status).toBe(200);
  expect(typeof res.body.accessToken).toBe("string");
  return res.body.accessToken as string;
}

async function createLedger(token: string, name: string) {
  const res = await request(app)
    .post("/auth/ledger")
    .set("Authorization", `Bearer ${token}`)
    .send({ name });
  return res;
}

async function listLedgers(token: string) {
  return request(app)
    .get("/auth/ledgers")
    .set("Authorization", `Bearer ${token}`);
}

async function selectLedger(token: string, ledgerId: string) {
  return request(app)
    .post(`/auth/ledgers/${ledgerId}/select`)
    .set("Authorization", `Bearer ${token}`);
}

async function getActiveLedger(token: string) {
  return request(app)
    .get("/auth/ledgers/active")
    .set("Authorization", `Bearer ${token}`);
}

async function createEntry(token: string, payload: { type: string; amount: string; currency: string; memo: string }) {
  return request(app)
    .post("/auth/entries")
    .set("Authorization", `Bearer ${token}`)
    .send(payload);
}

async function listEntries(token: string) {
  return request(app)
    .get("/auth/entries")
    .set("Authorization", `Bearer ${token}`);
}

describe("Task C - Ledgers + Entries (C1–C6)", () => {
  test("Ledger create unique per user: A duplicate -> 409, B same name -> 201", async () => {
    const tokenA = await authToken(`a_${Date.now()}@test.com`);
    const tokenB = await authToken(`b_${Date.now()}@test.com`);

    const r1 = await createLedger(tokenA, "Personal");
    expect(r1.status).toBe(201);
    expect(r1.body).toHaveProperty("id");
    expect(r1.body.name).toBe("Personal");

    const r2 = await createLedger(tokenA, "Personal");
    expect(r2.status).toBe(409);

    const r3 = await createLedger(tokenB, "Personal");
    expect(r3.status).toBe(201);
    expect(r3.body.name).toBe("Personal");
  });

  test("GET /ledgers returns only caller's ledgers", async () => {
    const tokenA = await authToken(`a_${Date.now()}@test.com`);
    const tokenB = await authToken(`b_${Date.now()}@test.com`);

    const a1 = await createLedger(tokenA, "A1");
    const a2 = await createLedger(tokenA, "A2");
    const b1 = await createLedger(tokenB, "B1");

    expect(a1.status).toBe(201);
    expect(a2.status).toBe(201);
    expect(b1.status).toBe(201);

    const listA = await listLedgers(tokenA);
    expect(listA.status).toBe(200);
    const idsA = (listA.body as any[]).map((l) => l.id);

    expect(idsA).toContain(a1.body.id);
    expect(idsA).toContain(a2.body.id);
    expect(idsA).not.toContain(b1.body.id);
  });

  test("Selecting another user's ledger -> 404 and does not change activeLedgerId", async () => {
    const tokenA = await authToken(`a_${Date.now()}@test.com`);
    const tokenB = await authToken(`b_${Date.now()}@test.com`);

    const aLedger = await createLedger(tokenA, "A1");
    const bLedger = await createLedger(tokenB, "B1");

    expect(aLedger.status).toBe(201);
    expect(bLedger.status).toBe(201);

    const before = await getActiveLedger(tokenA);
    expect(before.status).toBe(200);
    expect(before.body).toHaveProperty("activeLedgerId", null);

    const selectOther = await selectLedger(tokenA, bLedger.body.id);
    expect(selectOther.status).toBe(404);

    const after = await getActiveLedger(tokenA);
    expect(after.status).toBe(200);
    expect(after.body).toHaveProperty("activeLedgerId", null);
  });

  test("Entries require active ledger: POST/GET -> 409 without selection", async () => {
    const tokenA = await authToken(`a_${Date.now()}@test.com`);

    const post = await createEntry(tokenA, {
      type: "TEST",
      amount: "1.23",
      currency: "USD",
      memo: "no active ledger",
    });
    expect(post.status).toBe(409);

    const get = await listEntries(tokenA);
    expect(get.status).toBe(409);
  });

  test("Entry isolation by active ledger: switching active changes what list returns", async () => {
    const tokenA = await authToken(`a_${Date.now()}@test.com`);

    const l1 = await createLedger(tokenA, "L1");
    const l2 = await createLedger(tokenA, "L2");
    expect(l1.status).toBe(201);
    expect(l2.status).toBe(201);

    const sel1 = await selectLedger(tokenA, l1.body.id);
    expect(sel1.status).toBe(200);

    const e1 = await createEntry(tokenA, {
      type: "TEST",
      amount: "1.23",
      currency: "USD",
      memo: "entry in L1",
    });
    expect(e1.status).toBe(201);

    const list1 = await listEntries(tokenA);
    expect(list1.status).toBe(200);
    expect(Array.isArray(list1.body)).toBe(true);
    expect(list1.body.length).toBe(1);
    expect(list1.body[0].memo).toBe("entry in L1");

    const sel2 = await selectLedger(tokenA, l2.body.id);
    expect(sel2.status).toBe(200);

    const list2 = await listEntries(tokenA);
    expect(list2.status).toBe(200);
    expect(Array.isArray(list2.body)).toBe(true);
    expect(list2.body.length).toBe(0);
  });

  test("DB immutability: prisma update/delete on LedgerEntry throws (trigger)", async () => {
    const tokenA = await authToken(`a_${Date.now()}@test.com`);

    const l1 = await createLedger(tokenA, "L1");
    expect(l1.status).toBe(201);

    const sel1 = await selectLedger(tokenA, l1.body.id);
    expect(sel1.status).toBe(200);

    const e1 = await createEntry(tokenA, {
      type: "TEST",
      amount: "1.23",
      currency: "USD",
      memo: "immutable check",
    });
    expect(e1.status).toBe(201);

    const entryId = e1.body.id as string;

    // update should throw
    await expect(
      prisma.ledgerEntry.update({
        where: { id: entryId },
        data: { memo: "hacked" },
      })
    ).rejects.toThrow(/immutable|append-only/i);

    // delete should throw
    await expect(
      prisma.ledgerEntry.delete({
        where: { id: entryId },
      })
    ).rejects.toThrow(/immutable|append-only/i);
  });
});
