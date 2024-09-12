import * as util from "node:util";
import fs from "fs";

export default class Logger {
  constructor(path, prefix = "", options = { flags: "a" }) {
    this.stream = fs.createWriteStream(path, options);
    this.prefix = prefix;
  }
  #log(type, ...args) {
    if (typeof args[0] === "string") {
      console[type](this.prefix + args[0], ...args.slice(1));
    } else {
      console[type](this.prefix, ...args);
    }
    this.stream.write(util.format(...args) + "\n");
  }
  assert(value, message = "Logger.assert", ...optionalParams) {
    if (!value) {
      this.warn(`Assertion failed: ${message}`, ...optionalParams);
    }
  }
  debug(...args) {
    this.#log("debug", ...args);
  }
  error(...args) {
    this.#log("error", ...args);
  }
  info(...args) {
    this.#log("info", ...args);
  }
  log(...args) {
    this.#log("log", ...args);
  }
  warn(...args) {
    this.#log("warn", ...args);
  }
  close() {
    return new Promise(resolve => this.stream.close(resolve));
  }
}
