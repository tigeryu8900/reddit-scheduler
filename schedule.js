import puppeteer from "puppeteer";

import * as path from "path";
import os from "os";
import fs from "fs/promises";

const pendingDir = path.join(os.homedir(), ".reddit", "pending");

async function saveDataBase(dir, data, files) {
  await fs.mkdir(path.join(pendingDir, dir));
  for (const name in files) {
    const file = files[name];
    switch (file.type) {
      case "path":
        await fs.symlink(file.data.replaceAll("/", path.sep), path.join(pendingDir, dir, name));
        break;
      case "binary":
        await fs.writeFile(path.join(pendingDir, dir, name), Buffer.from(file.data, "binary"));
        break;
    }
  }
  await fs.writeFile(path.join(pendingDir, dir, "data.json"), JSON.stringify(data, null, 2));
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false
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
