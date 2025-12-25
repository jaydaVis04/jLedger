import request from "supertest";
import { prisma } from "../db/prisma";
import { app } from "../app";

beforeEach(async () => {
  // order matters because RefreshToken references User
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Auth", () => {
  test("register success -> 201", async () => {
    const email = `test_${Date.now()}@test.com`;

    const res = await request(app)
      .post("/auth/register")
      .send({ email, password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe(email);
    expect(res.body).toHaveProperty("id");
  });

  test("login success -> 200 + accessToken exists", async () => {
    const email = `test_${Date.now()}@test.com`;

    // register first
    await request(app)
      .post("/auth/register")
      .send({ email, password: "password123" });

    const res = await request(app)
      .post("/auth/login")
      .send({ email, password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.body.accessToken.length).toBeGreaterThan(20);
  });
});
