import puppeteer from "puppeteer";
import "dotenv/config";

import {createWriteStream} from "fs";
import fs from "fs/promises";
import * as path from "path";
import os from "os";
import Logger from "./logger.js";
import crypto from "crypto";
import {Readable} from "stream";
import {finished} from "stream/promises";
import {ReadableStream} from "stream/web";

const ctxDir = path.join(os.homedir(), ".reddit");
const pidDir = path.join(ctxDir, "pid");
const userDataDir = path.join(ctxDir, "User Data");
const pendingDir = path.join(ctxDir, "pending");
const failedDir = path.join(ctxDir, "failed");
const doneDir = path.join(ctxDir, "done");
const scheduled = {};
const running = new Set();

function scheduleFunction(handler, time, ...args) {
  let interval = null;
  let timeout = null;
  if (time - Date.now() < 2147483647) {
    timeout = setTimeout(handler, time - Date.now(), ...args);
  } else {
    interval = setInterval(() => {
      if (time - Date.now() < 2147483647) {
        clearInterval(interval);
        interval = null;
        timeout = setTimeout(handler, time - Date.now(), ...args);
      }
    }, 2147483647);
  }
  return {
    abort() {
      if (interval) {
        clearInterval(interval);
      }
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  };
}

async function uploadFile(page, elementHandle, dir, file, tempFiles) {
  if (/^https?:\/\//.test(file)) {
    const res = await fetch(file);
    const tempfile = path.join(os.tmpdir(), `${crypto.randomUUID()}.png`);
    const fileStream = createWriteStream(tempfile);
    await finished(
        Readable.fromWeb(ReadableStream.from(res.body)).pipe(fileStream));
    await elementHandle.uploadFile(tempfile);
    tempFiles.append(tempfile);
  } else {
    await elementHandle.uploadFile(path.resolve(pendingDir, dir, file));
  }
}

async function post(browser, dir) {
  const logger = new Logger(path.join(pendingDir, dir, "output.log"), dir);
  logger.log("Starting");
  running.add(dir);
  const data = JSON.parse(
      (await fs.readFile(path.join(pendingDir, dir, "data.json"))).toString());
  let success = false;
  const tempFiles = [];
  for (let i = 0; i < (data.maxRetries || 0) + 1; ++i) {
    logger.log("Opening page");
    const page = await browser.newPage();
    try {
      const old = !data.images && !data.gif;
      await page.setUserAgent(
          (await browser.userAgent()).replace(/headless/gi, ""));
      logger.log("Creating post");
      if (old) {
        await page.goto(`https://old.reddit.com/${data.subreddit}/submit`);
        logger.log("Adding title");
        await page.locator('[name="title"]').fill(data.title);
        switch (data.type) {
          case "text":
          case "post": {
            await page.locator('.text-button').click();
            if (data.body) {
              logger.log("Adding body");
              await page.locator('[name="text"]').fill(data.body);
            }
          }
            break;
          case "image": {
            logger.log("Adding image");
            const elementHandle = await page.$('#image');
            await uploadFile(page, elementHandle, path.resolve(pendingDir, dir),
                data.file, tempFiles);
            await elementHandle.dispose();
            await page.waitForSelector('[name="submit"]:not([disabled])', {
              timeout: 30 * 1000
            });
          }
            break;
          case "gallery":
          case "images":
            logger.assert(false, "galleries aren't supported in old reddit");
            break;
          case "video": {
            logger.log("Adding video");
            const elementHandle = await page.$('#image');
            await uploadFile(page, elementHandle, path.resolve(pendingDir, dir),
                data.file, tempFiles);
            await elementHandle.dispose();
            let progress = "0%";
            while (progress !== "100%") {
              await page.waitForSelector(
                  `#media-progress-bar:not([style*="width: ${progress};"])`);
              progress = await page.evaluate(
                  element => element ? element.style.width : progress,
                  await page.$(
                      `#media-progress-bar:not([style*="width: ${progress};"])`),
                  progress
              );
              logger.log(`Upload progress: ${progress}`);
            }
            await page.waitForSelector('[name="submit"]:not([disabled])');
            if (data.thumbnail) {
              logger.log("Choosing thumbnail");
              await page.locator(
                  `.thumbnail-scroller > :nth-child(${data.thumbnail})`).click();
            }
            logger.assert(!data.gif,
                "posting videos as gifs aren't supported in old reddit");
          }
            break;
          case "url":
          case "link": {
            logger.log("Adding url");
            await page.locator('#url').fill(data.url);
          }
            break;
        }
        if (data.flair) {
          logger.log("Setting flair");
          await page.locator('.flairselect-btn').click();
          await page.locator(
              `.flairselector.active .flairoptionpane [title=${JSON.stringify(
                  data.flair)}]`).click();
          await page.locator('.flairselector.active [type="submit"]').click();
        }
        await page.locator('[name="submit"]').click();
        await page.waitForNavigation();
      } else {
        switch (data.type) {
          case "text":
          case "post": {
            await page.goto(
                `https://www.reddit.com/${data.subreddit}/submit?type=TEXT`);
            logger.log("Adding title");
            await page.locator('>>> textarea[name="title"]').fill(data.title);
            if (data.body) {
              logger.log("Adding body");
              let markdown = await page.$(
                  '>>> ::-p-xpath(//button[text()="Markdown Editor"])');
              if (markdown) {
                await markdown.click();
                await markdown.dispose();
              }
              await page.locator('>>> [placeholder="Body"]').fill(data.body);
            }
          }
            break;
          case "image": {
            await page.goto(
                `https://www.reddit.com/${data.subreddit}/submit?type=IMAGE`);
            logger.log("Adding title");
            await page.locator('>>> textarea[name="title"]').fill(data.title);
            logger.log("Adding image");
            let elementHandle = await page.locator(
                '>>> input[type="file"][multiple="multiple"]').waitHandle();
            await uploadFile(page, elementHandle, path.resolve(pendingDir, dir),
                data.file, tempFiles);
            await elementHandle.dispose();
          }
            break;
          case "gallery":
          case "images": {
            await page.goto(
                `https://www.reddit.com/${data.subreddit}/submit?type=IMAGE`);
            logger.log("Adding title");
            await page.locator('>>> textarea[name="title"]').fill(data.title);
            logger.log("Adding images");
            let numImgs = 0;
            for (let i = 0; i < data.images.length; i++) {
              const image = data.images[i];
              const elementHandle = await page.locator(
                  '>>> input[type="file"][multiple="multiple"]').waitHandle();
              for (let j = 0; numImgs <= i && j < 10; j++) {
                await uploadFile(page, elementHandle,
                    path.resolve(pendingDir, dir), image.file, tempFiles);
                const time = Date.now();
                while (numImgs <= i && Date.now() - time < 10000) {
                  numImgs = await page.$$eval(
                      '>>> faceplate-carousel ul li img.opacity-30',
                      imgs => imgs.reduce(
                          (acc, img) => img.src.startsWith("blob:") ? acc.add(
                              img.src) : acc, new Set()).size);
                }
              }
              await elementHandle.dispose();
            }
            if (numImgs < data.images.length) {
              logger.error("Not enough images", data);
              return;
            }
            await page.locator('>>> button.edit-media').click();
            if (data.images.some(({caption, link}) => caption || link)) {
              await page.locator(
                  `>>> .image-container:first-child button.btn-edit`).setTimeout(
                  10000).click();
              for (let i = 0; i < data.images.length; ++i) {
                if (data.images[i].caption) {
                  await new Promise(resolve => setTimeout(resolve, 500));
                  await page.locator('>>> textarea[name="caption"]').fill(
                      data.images[i].caption);
                }
                if (data.images[i].link) {
                  await new Promise(resolve => setTimeout(resolve, 500));
                  await page.locator('>>> textarea[name="outboundUrl"]').fill(
                      data.images[i].link);
                }
                await page.locator('>>> #media-carousel-next').click();
              }
              await page.locator('>>> #edit-gallery-modal-save').click();
              await page.locator(
                  '#post-composer_media >>>> edit-gallery-modal >>>> #edit-gallery-internal-modal [slot="footer"] button.button-primary').click();
            }
          }
            break;
          case "video": {
            await page.goto(
                `https://www.reddit.com/${data.subreddit}/submit?type=IMAGE`);
            logger.log("Adding title");
            await page.locator('>>> textarea[name="title"]').fill(data.title);
            logger.log("Adding video");
            let elementHandle = await page.locator(
                '>>> input[type="file"][multiple="multiple"]').waitHandle();
            await uploadFile(page, elementHandle, path.resolve(pendingDir, dir),
                data.file, tempFiles);
            await elementHandle.dispose();
            await page.waitForSelector('>>> button.edit-media', {
              timeout: 5 * 60 * 1000
            });
            if (data.thumbnail || data.gif) {
              await page.locator('>>> button.edit-media').click();
              await new Promise(resolve => setTimeout(resolve, 1000));
              if (data.thumbnail) {
                logger.log("Choosing thumbnail");
                await page.locator(
                    `>>> .thumbnail:nth-child(${data.thumbnail})`).click();
              }
              if (data.gif) {
                await page.locator(
                    '#post-composer_media >>>> edit-video-modal >>>> #edit-video-internal-modal faceplate-checkbox-input').click();
              }
              await page.locator(
                  '#post-composer_media >>>> edit-video-modal >>>> #edit-video-internal-modal [slot="footer"] button.button-primary').click();
            }
          }
            break;
          case "url":
          case "link": {
            await page.goto(
                `https://www.reddit.com/${data.subreddit}/submit?type=LINK`);
            logger.log("Adding title");
            await page.locator('>>> textarea[name="title"]').fill(data.title);
            logger.log("Adding url");
            await page.locator('>>> textarea[name="link"]').fill(data.url);
          }
            break;
        }
        if (data.flair) {
          logger.log("Setting flair");
          await page.locator('>>> #reddit-post-flair-button').click();
          let allFlairs = page.$('>>> #view-all-flairs-button');
          if (allFlairs) {
            await allFlairs.click();
          }
          await page.$$eval(
              '>>> [aria-label="Post Flair Selection form"] [name="flairId"] >>> span',
              async (elements, flair) => {
                console.log(elements, flair);
                elements.find(element => element.innerText === flair).click();
              }, data.flair);
          await page.locator('>>> button.apply').click();
        }
        await page.locator('>>> #inner-post-submit-button').click();
        await page.waitForNavigation();
      }
      await page.goto(page.url().replace("www.reddit.com", "old.reddit.com"));
      const created = new URL(page.url()).searchParams.get("created");
      if (created) {
        await page.goto(
            `https://old.reddit.com/${data.subreddit}/comments/${created.substring(
                3)}`);
      }
      logger.log("Setting tags");
      if (data.oc) {
        const oc = await page.$(
            '.buttons [data-event-action="markoriginalcontent"]');
        if (oc) {
          await oc.click();
          await page.locator(
              '.buttons form:has([data-event-action="markoriginalcontent"]) .yes').click();
        }
      }
      if (data.spoiler) {
        const spoiler = await page.$('.buttons [data-event-action="spoiler"]');
        if (spoiler) {
          await spoiler.click();
          await page.locator(
              '.buttons form:has([data-event-action="spoiler"]) .yes').click();
        }
      }
      if (data.nsfw) {
        const nsfw = await page.$('.buttons [data-event-action="marknsfw"]');
        if (nsfw) {
          await nsfw.click();
          await page.locator(
              '.buttons form:has([data-event-action="marknsfw"]) .yes').click();
        }
      }
      if (data.comments) {
        logger.log("Adding comments");
        for (let comment of data.comments) {
          await page.locator('form.cloneable [name="text"]').fill(comment);
          await page.locator('form.cloneable [type="submit"]').click();
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      success = true;
      logger.log("Posted",
          page.url().replace("old.reddit.com", "www.reddit.com"), data);
      break;
    } catch (e) {
      logger.error("Error", data, e);
    } finally {
      await page.close();
      await logger.close();
      for (const tempFile of tempFiles) {
        await fs.rm(tempFile);
      }
    }
  }
  await fs.rename(path.join(pendingDir, dir),
      path.join(success ? doneDir : failedDir, dir));
  running.delete(dir);
}

function schedule(browser, dir, retry = false) {
  try {
    const time = Date.parse(dir.replace(
        /^.*?(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2})-(\d{1,2})-(\d{1,2})(?!\d).*$/,
        "$1-$2-$3T$4:$5:$6"));
    if ((retry || !scheduled.hasOwnProperty(dir)) && !running.has(dir)) {
      if (scheduled[dir]) {
        scheduled[dir].abort();
      }
      scheduled[dir] = scheduleFunction(post, time, browser, dir);
      console.log(dir, "Scheduled");
    }
  } catch (e) {
    console.error(dir, e);
  }
}

async function scheduleAll(browser, retry = false) {
  for (let dir of await fs.readdir(pendingDir)) {
    try {
      if (!dir.startsWith(".")) {
        schedule(browser, dir, retry);
      }
    } catch (e) {
      console.error(dir, e);
    }
  }
}

async function exit(signal) {
  console.log(process.pid, signal, "received, quitting");
  await this.close();
  await fs.rm(pidDir);
  process.exit();
}

(async () => {
  await fs.mkdir(ctxDir, {recursive: true}).catch(() => {
  });
  await fs.access(pidDir).then(async () => {
    process.kill(parseInt((await fs.readFile(pidDir)).toString()));
    console.log(process.pid,
        "Another instance is running, stopping that instance");
    await new Promise(async resolve => {
      while (await fs.access(pidDir).then(() => true, () => {
        resolve();
        return false;
      })) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    });
  }, () => {
  }).catch(() => {
    console.log(process.pid,
        "Previous instance crashed. You should check the logs.");
  });
  await fs.writeFile(pidDir, process.pid.toString());
  console.log(process.pid, "Starting", Date());
  await fs.mkdir(userDataDir, {recursive: true}).catch();
  await fs.mkdir(pendingDir, {recursive: true}).catch();
  await fs.mkdir(failedDir, {recursive: true}).catch();
  await fs.mkdir(doneDir, {recursive: true}).catch();
  const browser = await puppeteer.launch({
    headless: new Proxy({
      1: true,
      0: false,
      true: true,
      false: false,
      undefined: "new"
    }, {
      get(obj, prop) {
        return (prop in obj) ? obj[prop] : prop;
      }
    })[process.env.HEADLESS],
    pipe: true,
    userDataDir
  });
  process.once("SIGHUP", exit.bind(browser));
  process.once("SIGINT", exit.bind(browser));
  process.once("SIGTERM", exit.bind(browser));
  process.once("uncaughtException", exit.bind(browser));
  process.once("unhandledRejection", exit.bind(browser));
  const page = await browser.newPage();
  await page.setUserAgent(
      (await browser.userAgent()).replace(/headless/gi, ""));
  await page.goto("https://old.reddit.com/");
  await page.reload();
  const username = await (await page.locator('.user').waitHandle()).evaluate(
      element => {
        const a = element.querySelector('a');
        return a ? a.textContent : null;
      });
  switch (username) {
    case process.env.USERNAME:
      break;
    default:
      console.log("Signing out");
      await page.locator('.logout').click();
      await page.waitForNetworkIdle();
      // falls through
    case null:
      console.log("Signing in");
      await page.goto("https://www.reddit.com/login/");
      await page.locator('input[name="username"]').fill(process.env.USERNAME);
      await Promise.all([
        page.waitForNavigation(),
        page.locator('input[name="password"]').fill(
            process.env.PASSWORD + "\n")
      ]);
  }
  await page.close();
  console.log(process.pid, "Signed in");
  await scheduleAll(browser);
  for await (let event of fs.watch(pendingDir)) {
    try {
      if (!event.filename.startsWith(".")) {
        const filepath = path.join(pendingDir, event.filename);
        if (event.filename === "reschedule") {
          if (await new Promise(resolve => fs.access(filepath)
          .then(() => resolve(true), () => resolve(false)))) {
            console.log(process.pid, "Rescheduling");
            await fs.rm(filepath).catch(() => fs.rmdir(filepath));
            await scheduleAll(browser, true);
          }
        } else {
          schedule(browser, event.filename);
        }
      }
    } catch (e) {
      console.error(process.pid, event.filename, e);
    }
  }
})();
