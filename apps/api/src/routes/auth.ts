import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "../db/prisma";
import signAccessToken from "../auth/tokens"
import { generateRefreshToken, hashRefreshToken } from "../auth/refresh"
import { requireAuth } from "../middleware/requireAuth"
import { requireRole } from "../middleware/requireRole"

const router = Router(); // in general wire, to plug into app

const registerSchema = z.object({
        email:z.string().email(),
        password: z.string().min(8),
});

const loginSchema = z.object({
        email:z.string().email(),
        password: z.string().min(8),
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
    res.json({ ok: true })
});

export default router;
