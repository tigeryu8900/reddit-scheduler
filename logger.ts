import * as util from "node:util";
import * as fs from "fs";

export default class Logger {
  private stream: fs.WriteStream;
  private readonly prefix: any;

  constructor(path: string, prefix: any = "", options: any = {flags: "a"}) {
    this.stream = fs.createWriteStream(path, options);
    this.prefix = prefix;
  }

  assert(value: any, message = "Logger.assert", ...optionalParams: any[]): void {
    if (!value) {
      this.warn(`Assertion failed: ${message}`, ...optionalParams);
    }
  }

  debug(...args: any[]): void {
    this.#log("debug", ...args);
  }

  error(...args: any[]): void {
    this.#log("error", ...args);
  }

  info(...args: any[]): void {
    this.#log("info", ...args);
  }

  log(...args: any[]): void {
    this.#log("log", ...args);
  }

  warn(...args: any[]): void {
    this.#log("warn", ...args);
  }

  close(): Promise<NodeJS.ErrnoException | null | undefined> {
    return new Promise((resolve: (value: NodeJS.ErrnoException | null | undefined) => void) => this.stream.close(resolve));
  }

  #log(type: "assert" | "debug" | "error" | "info" | "log" | "warn", ...args: any[]): void {
    if (typeof args[0] === "string") {
      console[type](this.prefix, args[0], ...args.slice(1));
    } else {
      console[type](this.prefix, ...args);
    }
    this.stream.write(util.format(...args) + "\n");
  }
}
