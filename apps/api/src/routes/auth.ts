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

  const { type, currency, memo, lines } = req.body ?? {};

  // ---------- Basic validation ----------
  if (!type || !currency || !memo || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({
      error: "Missing required fields: type, currency, memo, lines (non-empty array required)",
    });
  }

  // ---------- Validate line structure ----------
  for (const line of lines) {
    if (
      !line.accountId ||
      !line.side ||
      !line.amount ||
      Number(line.amount) <= 0 ||
      !["DEBIT", "CREDIT"].includes(line.side)
    ) {
      return res.status(400).json({
        error: "Each line must include: accountId, side (DEBIT|CREDIT), positive amount",
      });
    }
  }

  // ---------- Enforce debit = credit ----------
  let debitTotal = 0;
  let creditTotal = 0;

  for (const line of lines) {
    const amt = Number(line.amount);

    if (line.side === "DEBIT") debitTotal += amt;
    if (line.side === "CREDIT") creditTotal += amt;
  }

  if (debitTotal !== creditTotal) {
    return res.status(400).json({
      error: "Debits must equal credits",
    });
  }

  // ---------- Verify active ledger ----------
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

  // ---------- Verify all accounts belong to this ledger ----------
  const accountIds = lines.map((l: any) => l.accountId);

  const accounts = await prisma.account.findMany({
    where: {
      id: { in: accountIds },
      ledgerId: activeLedger.id,
    },
    select: { id: true },
  });

  if (accounts.length !== accountIds.length) {
    return res.status(404).json({
      error: "One or more accounts not found in active ledger",
    });
  }

  // ---------- Create entry + lines (atomic nested write) ----------
  const entry = await prisma.ledgerEntry.create({
    data: {
      ledgerId: activeLedger.id,
      createdByUserId: userId,
      type,
      currency,
      memo,
      lines: {
        create: lines.map((l: any) => ({
          ledgerId: activeLedger.id,
          accountId: l.accountId,
          side: l.side,
          amount: l.amount,
          currency,
        })),
      },
    },
    include: {
      lines: true,
    },
  });

  return res.status(201).json(entry);
});

router.get("/entries", requireAuth, async (req, res) => {
  const userId = (req as any).userId as string;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeLedgerId: true },
  });

  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!user.activeLedgerId) return res.status(409).json({ error: "No active ledger selected" });

  // C5: verify active ledger belongs to this user
  const activeLedger = await prisma.ledger.findFirst({
    where: { id: user.activeLedgerId, userId },
    select: { id: true },
  });

  if (!activeLedger) return res.status(404).json({ error: "Active ledger not found" });

  const entries = await prisma.ledgerEntry.findMany({
    where: { ledgerId: activeLedger.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ledgerId: true,
      createdByUserId: true,
      createdAt: true,
      type: true,
      amount: true,
      currency: true,
      memo: true,
    },
  });

  return res.status(200).json(entries);
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

    // verify active ledger belongs to this user
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

export default router