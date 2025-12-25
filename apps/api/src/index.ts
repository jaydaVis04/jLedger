import "dotenv/config";
import express from "express"; // webserver framework
import { prisma } from "./db/prisma";
import cors from "cors"; // who controls api from browser?
import helmet from "helmet"; // safer http headers
import cookieParser from "cookie-parser"; // reads cookies
import authRouter from "./routes/auth";
import { app } from "./app";

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

const app = express(); //server object. mw + routes attached

app.use(helmet()); // safe http headers
app.use(cors({ origin: true, credentials: true}))
app.use(express.json());
app.use(cookieParser()); // accessible cookies. needed for auth refresh flow
app.use("/auth", authRouter);
app.get("/health", (_req, res) => res.json({ ok: true })); // simple endpoint. debug. is api up?

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.post("/dev/create-user", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password required!" });
    }

    try {
        const user = await prisma.user.create({
            data: { email, pwHash: password },
            select: { id: true, email: true, createdAt: true },
        });

        return res.status(201).json(user);
    } catch (err: any) {
        return res.status(400).json({ error: err?.message ?? "Created failed" });
    }
});

app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
