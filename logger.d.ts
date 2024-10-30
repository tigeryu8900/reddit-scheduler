export default class Logger {
    #private;
    private stream;
    private readonly prefix;
    constructor(path: string, prefix?: any, options?: any);
    assert(value: any, message?: string, ...optionalParams: any[]): void;
    debug(...args: any[]): void;
    error(...args: any[]): void;
    info(...args: any[]): void;
    log(...args: any[]): void;
    warn(...args: any[]): void;
    close(): Promise<NodeJS.ErrnoException | null | undefined>;
}
