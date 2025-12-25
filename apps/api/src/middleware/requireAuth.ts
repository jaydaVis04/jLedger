import type { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.header("Authorization");
  if (!auth) return res.status(401).json({ error: "Missing Authorization header!" });
  if (!auth.startsWith("Bearer "))
    return res.status(401).json({ error: "Invalid auth scheme!" });

  const token = auth.slice("Bearer ".length);
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) return res.status(500).json({ error: "Server misconfig!" });

  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    const userId = payload.sub;
    if (typeof userId !== "string")
      return res.status(401).json({ error: "Invalid token payload!" });

    (req as any).userId = userId;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token!" });
  }
}
