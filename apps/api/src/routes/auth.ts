import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "../db/prisma";
import signAccessToken from "../auth/tokens"
import { generateRefreshToken, hashRefreshToken } from "../auth/refresh"
import { requireAuth } from "../middleware/requireAuth"
import { requireRole } from "../middleware/requireRole"
import { AccountType } from "@prisma/client";

const router = Router(); // in general wire, to plug into app

const registerSchema = z.object({
        email:z.string().email(),
        password: z.string().min(8),
});

const loginSchema = z.object({
        email:z.string().email(),
        password: z.string().min(8),
});

const accountCreateSchema = z.object({
    name: z.string().min(1),
    type: z.nativeEnum(AccountType),
});


router.post("/register", async (req,res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid email or password!" });
    }

    const { email, password } = parsed.data;

    try {
        const pwHash = await bcrypt.hash(password, 12);
        const user = await prisma.user.create({
            data: { email, pwHash },
            select: { id: true, email: true, createdAt: true },
        });

        return res.status(201).json(user);

    } catch (err) {
        console.error("REGISTER ERROR:", err);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("unique")) {
            return res.status(409).json({ error: "Email already registered!" });
       }
        
        return res.status(500).json({ error: "Server error!"});

    }
});

router.post("/login", async (req, res) => {
    const parsedLogin = loginSchema.safeParse(req.body);
    if (!parsedLogin.success) {
        return res.status(400).json({ error: "Invalid email or password!" });
    }

    const { email, password } = parsedLogin.data;

    try {
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(401).json({ error: "Invalid email or password!" });
        }

        const ok = await bcrypt.compare(password, user.pwHash);
        if (!ok) {
            return res.status(401).json({ error: "Invalid email or password! "})
        }
        const accessToken = signAccessToken(user.id);

        const rawRefreshToken = generateRefreshToken();
        const tokenHash = hashRefreshToken(rawRefreshToken);

        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        const expiresAt = new Date(Date.now() + sevenDaysMs);

        await prisma.refreshToken.create({
            data: { tokenHash, userId: user.id, expiresAt },
        });

        res.cookie("refresh_token", rawRefreshToken, {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            path: "/auth/refresh",
            maxAge: sevenDaysMs,
        });

        return res.status(200).json({ ok: true, accessToken, user: { id: user.id, email: user.email } });
    }
    
    catch (err) {
        console.error("LOGIN ERROR:", err);
        return res.status(500).json({ error: "Server error!" });
       }
    
});

router.post("/refresh", async (req, res) => {
    const readCookie = req.cookies?.refresh_token;
    if (!readCookie) {
        return res.status(401).json({ error: "Missing coookie!"});
    }

    const hashedCookie = hashRefreshToken(readCookie) 

    const row = await prisma.refreshToken.findFirst({
        where: { tokenHash: hashedCookie, revokedAt: null, expiresAt: { gt: new Date() } },
    });

    if (!row) {
        return res.status(401).json({ error: "Invalid or expired refresh token!" });
    }

    if (row) {
        const newRaw = generateRefreshToken();
        const newHash = hashRefreshToken(newRaw);

        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        const newExpiresAt = new Date(Date.now() + sevenDaysMs);

        await prisma.$transaction([
            prisma.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } }),
            prisma.refreshToken.create({ data: { tokenHash: newHash, userId: row.userId, expiresAt: newExpiresAt } }),
        ]);

        res.cookie("refresh_token", newRaw, {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            path: "/auth/refresh",
            maxAge: sevenDaysMs,
        });

        const accessToken = signAccessToken(row.userId);
        return res.status(200).json({ ok: true, accessToken });

    };
});

router.get("/me", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, createdAt: true },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found!" });
  }

  return res.status(200).json({ ok: true, user });
});

router.get("/admin/ping", requireAuth, requireRole("ADMIN"), (req, res) => {
    res.json({ ok: true });
});

router.post("/ledger", requireAuth, async (req, res) => {
    if (!req.body.name) {
        return res.status(400).json({ error: "Missing body input!" });
    }
    try {
        const ledger = await prisma.ledger.create({
            data: { name: req.body.name, userId: req.userId },
        });

        return res.status(201).json(ledger);

    } catch (err: any) {
        if (err.code === "P2002") {
            return res.status(409).json({ error: "This already exists in your ledgers!" });
        } else {

            return res.status(500).json({ error: "Server error." });

        }
    }

});

router.get("/ledgers", requireAuth, async (req, res) => {
    const myLedgers = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { ledgers: true },
    });

    if (myLedgers == null) {
        return res.status(401).json({ error: "Unauthorized!" });
    }

    return res.status(200).json(myLedgers.ledgers);

});

router.post("/ledgers/:id/select", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const ledgerId = req.params.id;

  if (!ledgerId) {
    return res.status(400).json({ error: "Missing ledger id." });
  }

  // 1) verify ledger belongs to this user
  const ledger = await prisma.ledger.findFirst({
    where: { id: ledgerId, userId },
    select: { id: true },
  });

  if (!ledger) {
    // either doesn't exist OR not owned by this user
    return res.status(404).json({ error: "Ledger not found." });
  }

  // 2) set activeLedgerId on user
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { activeLedgerId: ledgerId },
    select: { activeLedgerId: true },
  });

  return res.status(200).json(updated);
});

router.get("/ledgers/active", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { activeLedgerId: true },
  });

  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return res.status(200).json({ activeLedgerId: user.activeLedgerId });

});

router.post("/entries", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;

  try {
    const { type, amount, currency, memo, lines } = req.body ?? {};

    if (!type || !currency || !memo) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // get active ledger
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { activeLedgerId: true },
    });

    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!user.activeLedgerId)
      return res.status(409).json({ error: "No active ledger selected" });

    const activeLedger = await prisma.ledger.findFirst({
      where: { id: user.activeLedgerId, userId },
      select: { id: true },
    });

    if (!activeLedger)
      return res.status(404).json({ error: "Active ledger not found" });

    // -------------------------------
    // D3 MODE (line-based entries)
    // -------------------------------
    if (Array.isArray(lines) && lines.length > 0) {
      const entry = await prisma.ledgerEntry.create({
        data: {
          ledgerId: activeLedger.id,
          createdByUserId: userId,
          type,
          amount: "0", // header amount not used in D3 mode
          currency,
          memo,
          lines: {
            create: lines.map((l: any) => ({
              accountId: l.accountId,
              side: l.side,
              amount: l.amount,
              currency,
            })),
          },
        },
        include: { lines: true },
      });

      return res.status(201).json(entry);
    }

    // -------------------------------
    // LEGACY MODE (old Task C tests)
    // -------------------------------
    if (amount === undefined || amount === null) {
      return res.status(400).json({ error: "Missing amount" });
    }

    const entry = await prisma.ledgerEntry.create({
      data: {
        ledgerId: activeLedger.id,
        createdByUserId: userId,
        type,
        amount,
        currency,
        memo,
      },
    });

    return res.status(201).json(entry);

  } catch (err) {
    console.error("CREATE ENTRY ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/*
  GET /auth/entries
*/
router.get("/entries", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { activeLedgerId: true },
    });

    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!user.activeLedgerId)
      return res.status(409).json({ error: "No active ledger selected" });

    const activeLedger = await prisma.ledger.findFirst({
      where: { id: user.activeLedgerId, userId },
      select: { id: true },
    });

    if (!activeLedger)
      return res.status(404).json({ error: "Active ledger not found" });

    const entries = await prisma.ledgerEntry.findMany({
      where: { ledgerId: activeLedger.id },
      orderBy: { createdAt: "asc" },
    });

    return res.status(200).json(entries);

  } catch (err) {
    console.error("LIST ENTRIES ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/accounts", requireAuth, async (req, res) => {
    const userId = (req as any).userId as string;

    const parsed = accountCreateSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: "Missing or invalid required fields: name, type" });
    }
    
    const { name, type } = parsed.data;

    // find users activeledgerid
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { activeLedgerId: true }
    });

    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!user.activeLedgerId) return res.status(409).json({ error: "No active ledger selected" });

    // belongs to user?
    const activeLedger = await prisma.ledger.findFirst({
        where: { id: user.activeLedgerId, userId },
        select: { id: true },
    });

    if (!activeLedger) return res.status(404).json({ error: "Active ledger not found" });

    try {
        const createdAccount = await prisma.account.create({
            data: {
                ledgerId: activeLedger.id,
                name,
                type,
            },
            select : {
                id: true,
                ledgerId: true,
                name: true,
                type: true,
                createdAt: true,
            },
        });

        return res.status(201).json(createdAccount);
    } catch (err: any) {
        // unique per ledger constraint
        if (err?.code == "P2002") {
            return res.status(409).json({ error: "Account name already exists in this ledger!" });
        }
        console.error("CREATE ACCOUNT ERROR:", err);
        return res.status(500).json({ error: "Server error." });
    }
});

router.get("/accounts", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { activeLedgerId: true },
    });

    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!user.activeLedgerId) return res.status(409).json({ error: "No active ledger selected" });

    const activeLedger = await prisma.ledger.findFirst({
      where: { id: user.activeLedgerId, userId },
      select: { id: true },
    });

    if (!activeLedger) return res.status(404).json({ error: "Active ledger not found" });

    const accounts = await prisma.account.findMany({
      where: { ledgerId: activeLedger.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, ledgerId: true, name: true, type: true, createdAt: true },
    });

    return res.status(200).json(accounts);
  } catch (err) {
    console.error("LIST ACCOUNTS ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/accounts/:id/balance", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;
  const accountId = req.params.id;

  try {
    // ---------- Step 1: active ledger check ----------
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { activeLedgerId: true },
    });

    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!user.activeLedgerId)
      return res.status(409).json({ error: "No active ledger selected" });

    const activeLedger = await prisma.ledger.findFirst({
      where: { id: user.activeLedgerId, userId },
      select: { id: true },
    });

    if (!activeLedger)
      return res.status(404).json({ error: "Active ledger not found" });

    // ---------- Step 2: verify account belongs to active ledger ----------
    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        ledgerId: activeLedger.id,
      },
      select: {
        id: true,
        name: true,
        type: true,
      },
    });

    if (!account)
      return res.status(404).json({ error: "Account not found in active ledger" });

    // ---------- Step 3: sum DEBITS ----------
    const debitAgg = await prisma.entryLine.aggregate({
      where: {
        ledgerId: activeLedger.id,
        accountId: account.id,
        side: "DEBIT",
      },
      _sum: {
        amount: true,
      },
    });

    // ---------- Step 4: sum CREDITS ----------
    const creditAgg = await prisma.entryLine.aggregate({
      where: {
        ledgerId: activeLedger.id,
        accountId: account.id,
        side: "CREDIT",
      },
      _sum: {
        amount: true,
      },
    });

    const debits = Number(debitAgg._sum.amount ?? 0);
    const credits = Number(creditAgg._sum.amount ?? 0);

    // ---------- Step 5: compute derived balance ----------
    let balance = 0;

    if (account.type === "ASSET" || account.type === "EXPENSE") {
      balance = debits - credits;
    } else {
      balance = credits - debits;
    }

    return res.status(200).json({
      accountId: account.id,
      name: account.name,
      type: account.type,
      debits,
      credits,
      balance,
    });
  } catch (err) {
    console.error("BALANCE ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router