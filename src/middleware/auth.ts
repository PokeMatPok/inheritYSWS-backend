import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET ?? (() => {
    console.error('JWT_SECRET environment variable is not set. Authentication will not work.');
    process.exit(1);
})();

export type UserPayload = {
    id: number;
    username: string;
    email: string;
    role: string;
}


export interface AuthenticatedRequest extends Request {
    user?: UserPayload;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction, rejectFunc?: (message: string) => void) {
    const token = req.cookies?.token as string;
    
    if (!token) {
        if (rejectFunc) {
            rejectFunc('Access denied. No token provided.');
            return;
        } else {
            return res.status(401).json({ error: 'Access denied. No token provided.' });
        }
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as unknown as UserPayload;
        req.user = decoded;
        next();
    } catch (error) {
        if (rejectFunc) {
            rejectFunc('Invalid token.');
            return;
        } else {
            return res.status(400).json({ error: 'Invalid token.' });
        }
    }
}

export function generateToken(user: UserPayload) {
    return jwt.sign(user, JWT_SECRET, { expiresIn: '1h' });
}