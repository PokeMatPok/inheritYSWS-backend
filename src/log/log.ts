import console from "node:console";

export const Colors = {
    Reset: "\x1b[0m",
    Bright: "\x1b[1m",
    Dim: "\x1b[2m",
    Underscore: "\x1b[4m",
    Blink: "\x1b[5m",
    Reverse: "\x1b[7m",
    Hidden: "\x1b[8m",
    Black: "\x1b[30m",
    Red: "\x1b[31m",
    Green: "\x1b[32m",
    Yellow: "\x1b[33m",
    Blue: "\x1b[34m",
    Magenta: "\x1b[35m",
    Cyan: "\x1b[36m",
    White: "\x1b[37m",
}

type LogConfig = {
    AppName: string;
    LogColors: {
        Debug: string;
        Info: string;
        Warning: string;
        Error: string;
    },

    // respect the NoColor flag to disable colors in logs
    NoColor?: boolean;
    Console: console.Console;

    Callback?: (level: 'debug' | 'info' | 'warn' | 'error', message: string) => void;
}

export class LogDriver {
    private config: LogConfig;

    constructor(config: LogConfig) {
        this.config = config;
    }

    log(...args: any[]) {

        if (this.config.Callback) {
            const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
            this.config.Callback('info', message);
        }

        this.config.NoColor
            ? this.config.Console.log(`[${this.config.AppName}]`, ...args)
            :
            this.config.Console.log(`${this.config.LogColors.Info}[${this.config.AppName}]${Colors.Reset}`, ...args);
    }

    debug(...args: any[]) {
        if (this.config.Callback) {
            const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
            this.config.Callback('debug', message);
        }

        this.config.NoColor
            ? this.config.Console.debug(`[${this.config.AppName}]`, ...args)
            :
            this.config.Console.debug(`${this.config.LogColors.Debug}[${this.config.AppName}]${Colors.Reset}`, ...args);
    }

    warn(...args: any[]) {
        if (this.config.Callback) {
            const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
            this.config.Callback('warn', message);
        }

        this.config.NoColor ? this.config.Console.warn(`[${this.config.AppName}]`, ...args)
            :
            this.config.Console.warn(`${this.config.LogColors.Warning}[${this.config.AppName}]${Colors.Reset}`, ...args);
    }

    error(...args: any[]) {
        if (this.config.Callback) {
            const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
            this.config.Callback('error', message);
        }

        this.config.NoColor ? this.config.Console.error(`[${this.config.AppName}]`, ...args)
            :

            this.config.Console.error(`${this.config.LogColors.Error}[${this.config.AppName}]${Colors.Reset}`, ...args);
    }

    loader(Message: string, resolve: Promise<any>) {
        const steps = ['ᗧ···', ' ᗧ··', '  ᗧ·', '   ᗧ'];
        let i = 0;
        const interval = setInterval(() => {
            process.stdout.write(`\r${this.config.LogColors.Info}${steps[i++ % steps.length]}${Colors.Reset} ${Message}`);
        }, 300);

        resolve.finally(() => {
            clearInterval(interval);
            process.stdout.write(`\r${this.config.LogColors.Info}✓${Colors.Reset} ${' '.repeat(3) + Message}\r\n`);
        });
    }

    isNoColor() {
        return this.config.NoColor;
    }

    whenColor(Message: string) {
        if (!this.config.NoColor) {
            return Message;
        }
    }
}