import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "../db/prisma";

const router = Router();

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
            return res.status(200).json({ ok: true, user: { id: user.id, email: user.email } });
        }
        
        return res.status(401).json({ error: "Invalid email or password!" });

    }
    
    catch (err) {
        console.error("LOGIN ERROR:", err);
        const msg = err instanceof Error ? err.message : String(err);
            return res.status(500).json({ error: "Server error!" });
       }
    
});

export default router;
