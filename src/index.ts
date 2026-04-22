import express from 'express';
import dotenv from 'dotenv';
import { LogDriver, Colors } from './log/log';
import { db, migrate } from './db';
import authRouter from './routes/auth';
import { authenticate, AuthenticatedRequest } from './middleware/auth';
import cookie from 'cookie-parser';
import cors from 'cors';

const NoColor = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "";

const logger = new LogDriver({
    AppName: 'Inherit Backend',
    LogColors: {
        Debug: Colors.Cyan,
        Info: Colors.Green,
        Warning: Colors.Yellow,
        Error: Colors.Red
    },
    NoColor,
    Console: console
});

console = new Proxy(console, {
    get(target, prop) {
        if (prop === 'log') return logger.log.bind(logger);
        if (prop === 'debug') return logger.debug.bind(logger);
        if (prop === 'warn') return logger.warn.bind(logger);
        if (prop === 'error') return logger.error.bind(logger);
        return Reflect.get(target, prop);
    }
});

if (NoColor) {
    logger.warn('Respecting NO_COLOR environment variable, disabling colors in logs.');
}

dotenv.config();

const app = express();
const port = 3000;

logger.loader('Connecting to the database...', Promise.all([
    db.connect()
        .catch((err) => logger.error('Could not connect to the database:', err)),
    migrate()
        .catch((err) => logger.error('Could not migrate the database:', err)),
    db.query('SELECT NOW()')
        .then((res) => {
            const dbTime = new Date(res.rows[0].now);
            const serverTime = new Date();
            // more than 5 secs, you're probably pretty :D
            const timeDiff = Math.abs(dbTime.getTime() - serverTime.getTime());
            if (timeDiff > 5000) {
                logger.warn('Database time is not in sync with server time.');
            }
        })
        .catch((err) => logger.error('Could not fetch database time:', err))
]).catch((err) => {
    logger.error('Database connection error:', err);
}));

const corsConfig = {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
}

app.use(express.json());
app.use(cors(corsConfig));
app.use(cookie());

app.use('/auth', authRouter);

app.get('/protected', authenticate, (req, res) => {
    res.json({ message: 'This is a protected route! Hello ' + (req as AuthenticatedRequest).user?.username });
});

app.listen(port, () => {
    logger.log(`Port ${port} is up and running!`);

    try {
        const dns = require('node:dns');
        const os = require('node:os');

        const options = { family: 4 };

        dns.lookup(os.hostname(), options, (err: NodeJS.ErrnoException | null, addr: string) => {
            if (err) {
                throw err;
            } else {
                logger.debug('Local: http://localhost:' + port + '/ Network: http://' + addr + ':' + port + '/');
            }
        });

    } catch (err) {
        logger.warn('Could not get network address');
        logger.debug('Local: http://localhost:' + port + '/');
    }
});
