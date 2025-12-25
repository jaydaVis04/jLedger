import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";

export const requireRole =
  (role: "ADMIN" | "USER") =>
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as any).userId as string;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (user.role !== role) return res.status(403).json({ error: "Forbidden" });

    return next();
  };

