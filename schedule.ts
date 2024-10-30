import puppeteer from "puppeteer";

import * as path from "path";
import os from "os";
import {createWriteStream} from "fs";
import fs from "fs/promises";
import * as crypto from "crypto";
import {Readable} from "stream";
import {fetch} from "undici";
import {finished} from "stream/promises";
import mime from "mime-types";
import {Data} from "./data.js";

const pendingDir: string = path.join(os.homedir(), ".reddit", "pending");
const userDataDir: string = path.join(os.homedir(), ".reddit", "Scheduler User Data");

async function getTmpdir() {
  const tmpdir = path.join(os.tmpdir(), crypto.randomUUID());
  await fs.mkdir(tmpdir, {recursive: true});
  return tmpdir;
}

interface File {
  type: "path" | "url" | "binary";
  data: string;
}

async function addFile(tmpdir: string, file: File, name: string): Promise<void> {
  switch (file.type) {
    case "path":
      await fs.symlink(file.data.replaceAll("/", path.sep), path.join(tmpdir, name));
      break;
    case "url":
      const res = await fetch(file.data);
      const fileStream = createWriteStream(path.join(tmpdir, name));
      if (res.body) {
        await finished(Readable.fromWeb(res.body).pipe(fileStream));
      }
      break;
    case "binary":
      await fs.writeFile(path.join(tmpdir, name), Buffer.from(file.data, "binary"));
      break;
  }
}

async function finishSaveData(tmpdir: string, dir: string, data: Data): Promise<void> {
  await fs.writeFile(path.join(tmpdir, "data.json"), JSON.stringify(data, null, 2));
  await fs.rename(tmpdir, path.join(pendingDir, dir));
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    protocolTimeout: 0,
    defaultViewport: {
      width: 0,
      height: 0
    },
    pipe: true,
    userDataDir
  });
  const page = await browser.newPage();
  await page.goto("file://" + path.resolve("schedule.html").replaceAll(path.delimiter, "/"));
  await Promise.all([
    page.exposeFunction("getTmpdir", getTmpdir),
    page.exposeFunction("addFile", addFile),
    page.exposeFunction("finishSaveData", finishSaveData),
    page.exposeFunction("closeBrowser", () => browser.close()),
    page.exposeFunction("mimeExtension", (name: string) => mime.extension(name))
  ]);
  await page.evaluate(() => {
    Object.assign(globalThis, {
      async saveData(dir: string, data: Data, files: Record<string, File>): Promise<void> {
        const tmpdir = await getTmpdir();
        await Promise.all(Object.entries(files).map(([name, file]) => addFile(tmpdir, file, name)));
        await finishSaveData(tmpdir, dir, data);
      }
    });
  });
})();
