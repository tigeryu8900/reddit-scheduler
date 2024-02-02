import puppeteer from "puppeteer";

import * as path from "path";
import os from "os";
import fs from "fs/promises";
import * as crypto from "crypto";

const pendingDir = path.join(os.homedir(), ".reddit", "pending");
const userDataDir = path.join(os.homedir(), ".reddit", "Scheduler User Data");

async function saveDataBase(dir, data, files) {
  const tmpdir = path.join(os.tmpdir(), crypto.randomUUID());
  await fs.mkdir(tmpdir, {recursive: true});
  for (const name in files) {
    const file = files[name];
    switch (file.type) {
      case "path":
        await fs.symlink(file.data.replaceAll("/", path.sep), path.join(tmpdir, name));
        break;
      case "binary":
        await fs.writeFile(path.join(tmpdir, name), Buffer.from(file.data, "binary"));
        break;
    }
  }
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
  await page.exposeFunction("saveDataBase", saveDataBase);
  await page.evaluate(async () => await new Promise(resolve => {
    window.saveData = function (dir, data, files) {
      saveDataBase(dir, data, files).then(() => {
        alert(`${dir} saved`);
        resolve();
      });
    }
  }));
  await browser.close();
})();
