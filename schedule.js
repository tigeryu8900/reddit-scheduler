import puppeteer from "puppeteer";

import * as path from "path";
import os from "os";
import fs from "fs/promises";
import * as crypto from "crypto";

const pendingDir = path.join(os.homedir(), ".reddit", "pending");
const userDataDir = path.join(os.homedir(), ".reddit", "Scheduler User Data");

async function getTmpdir() {
  const tmpdir = path.join(os.tmpdir(), crypto.randomUUID());
  await fs.mkdir(tmpdir, {recursive: true});
  return tmpdir;
}

async function addFile(tmpdir, file, name) {
  switch (file.type) {
    case "path":
      await fs.symlink(file.data.replaceAll("/", path.sep), path.join(tmpdir, name));
      break;
    case "binary":
      await fs.writeFile(path.join(tmpdir, name), Buffer.from(file.data, "binary"));
      break;
  }
}

async function finishSaveData(tmpdir, dir, data) {
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
    userDataDir
  });
  const page = await browser.newPage();
  await page.goto("file://" + path.resolve("schedule.html").replaceAll(path.delimiter, "/"));
  await Promise.all([
    page.exposeFunction("getTmpdir", getTmpdir),
    page.exposeFunction("addFile", addFile),
    page.exposeFunction("finishSaveData", finishSaveData),
    page.exposeFunction("closeBrowser", () => browser.close())
  ]);
  await page.evaluate(() => {
    window.saveData = async function (dir, data, files) {
      const tmpdir = await getTmpdir();
      await Promise.all(Object.entries(files).map(([name, file]) => addFile(tmpdir, file, name)));
      await finishSaveData(tmpdir, dir, data);
    }
  });
})();
