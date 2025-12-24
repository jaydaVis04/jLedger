import "dotenv/config";
import jwt from "jsonwebtoken";

const signAccessToken = (userId: string, expiresIn: string = "15m"): string => {
    const token = process.env.JWT_ACCESS_SECRET;

    if (!token) throw new Error("Missing JWT_ACCESS_SECRET");

    return jwt.sign({ sub: userId }, token, { expiresIn });

};

export default signAccessToken;
