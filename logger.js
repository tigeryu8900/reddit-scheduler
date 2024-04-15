import * as util from "node:util";
import fs from "fs";

export default class Logger {
  constructor(path, options = { flags: "a" }) {
    this.stream = fs.createWriteStream(path, options);
  }
  assert(value, message = "console.assert", ...optionalParams) {
    if (!value) {
      this.warn(`Assertion failed: ${message}`, ...optionalParams);
    }
  }
  debug(...args) {
    console.debug(...args);
    this.stream.write(util.format(...args) + "\n");
  }
  error(...args) {
    console.error(...args);
    this.stream.write(util.format(...args) + "\n");
  }
  info(...args) {
    console.info(...args);
    this.stream.write(util.format(...args) + "\n");
  }
  log(...args) {
    console.log(...args);
    this.stream.write(util.format(...args) + "\n");
  }
  warn(...args) {
    console.warn(...args);
    this.stream.write(util.format(...args) + "\n");
  }
  close() {
    return new Promise(resolve => this.stream.close(resolve));
  }
}
