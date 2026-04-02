import request from "supertest";
import { prisma } from "../db/prisma";
import { app } from "../app";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "EntryLine",
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

async function authToken(email: string, password = "password123") {
  await request(app).post("/auth/register").send({ email, password }).expect(201);
  const res = await request(app).post("/auth/login").send({ email, password }).expect(200);
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

async function createAccount(token: string, name: string, type: string) {
  return request(app)
    .post("/auth/accounts")   // FIXED
    .set("Authorization", `Bearer ${token}`)
    .send({ name, type });
}

async function createEntry(token: string, payload: any) {
  return request(app)
    .post("/auth/entries")   // FIXED
    .set("Authorization", `Bearer ${token}`)
    .send(payload);
}

async function listEntries(token: string) {
  return request(app)
    .get("/auth/entries")   // FIXED
    .set("Authorization", `Bearer ${token}`);
}

describe("Task C - Ledgers + Entries (D3 version)", () => {

  test("Entries require active ledger: POST/GET -> 409 without selection", async () => {
    const token = await authToken(`noactive_${Date.now()}@test.com`);

    const res = await createEntry(token, {
      type: "TEST",
      currency: "USD",
      memo: "no active ledger",
      lines: [
        { accountId: "fake", side: "DEBIT", amount: 1 },
        { accountId: "fake2", side: "CREDIT", amount: 1 }
      ]
    });

    expect(res.status).toBe(409);

    const get = await listEntries(token);
    expect(get.status).toBe(409);
  });

  test("Entry isolation by active ledger: switching active changes what list returns", async () => {
    const token = await authToken(`switch_${Date.now()}@test.com`);

    const l1 = await createLedger(token, "L1");
    const l2 = await createLedger(token, "L2");

    await selectLedger(token, l1.body.id);

    const cash = await createAccount(token, "Cash", "ASSET");
    const revenue = await createAccount(token, "Revenue", "REVENUE");

    const e1 = await createEntry(token, {
      type: "INCOME",
      currency: "USD",
      memo: "entry in L1",
      lines: [
        { accountId: cash.body.id, side: "DEBIT", amount: 100 },
        { accountId: revenue.body.id, side: "CREDIT", amount: 100 }
      ]
    });

    expect(e1.status).toBe(201);

    const list1 = await listEntries(token);
    expect(list1.status).toBe(200);
    expect(Array.isArray(list1.body)).toBe(true);
    expect(list1.body.length).toBe(1);

    await selectLedger(token, l2.body.id);

    const list2 = await listEntries(token);
    expect(list2.status).toBe(200);
    expect(list2.body.length).toBe(0);
  });

  test("DB immutability: prisma update/delete on LedgerEntry throws", async () => {
    const token = await authToken(`immutable_${Date.now()}@test.com`);

    const ledger = await createLedger(token, "Main");
    await selectLedger(token, ledger.body.id);

    const cash = await createAccount(token, "Cash", "ASSET");
    const revenue = await createAccount(token, "Revenue", "REVENUE");

    const entry = await createEntry(token, {
      type: "INCOME",
      currency: "USD",
      memo: "immutable check",
      lines: [
        { accountId: cash.body.id, side: "DEBIT", amount: 100 },
        { accountId: revenue.body.id, side: "CREDIT", amount: 100 }
      ]
    });

    expect(entry.status).toBe(201);

    const entryId = entry.body.id as string;

    await expect(
      prisma.ledgerEntry.update({
        where: { id: entryId },
        data: { memo: "hacked" },
      })
    ).rejects.toThrow();

    await expect(
      prisma.ledgerEntry.delete({
        where: { id: entryId },
      })
    ).rejects.toThrow();
  });

});