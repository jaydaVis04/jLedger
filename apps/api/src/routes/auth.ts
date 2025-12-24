import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "../db/prisma";
import signAccessToken from "../auth/tokens"
import { generateRefreshToken, hashRefreshToken } from "../auth/refresh"

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

        if (ok) {
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

        return res.status(200).json({ ok: true, accessToken, user });
}
    
    catch (err) {
        console.error("LOGIN ERROR:", err);
        const msg = err instanceof Error ? err.message : String(err);
            return res.status(500).json({ error: "Server error!" });
       }
    
});

router.post("/refresh", async (req, res) => {
    const readCookie = req.cookies.refresh_token;
    if (readcookie) {
        const hashedCookie = hashRefreshToken(readCookie) 

        await prisma.refreshToken.findFirst({
            where: { tokenHash: hashedCookie, revokedAt: null, expiresAt: { gt: new Date() } },
        });

        //cookie not found
        return res.status(401).json({ errror: "Missing cookie"});
    }

    return res.status(401).json({ error: "Missing coookie!"});
});

export default router;
