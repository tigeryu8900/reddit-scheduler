import puppeteer, {Browser, ElementHandle} from "puppeteer";
import "dotenv/config";

import {createWriteStream} from "fs";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import Logger from "./logger.ts";
import * as crypto from "crypto";
import {Readable} from "stream";
import {finished} from "stream/promises";
import {fetch} from "undici";
import {Data} from "./data.ts";

const ctxDir: string = path.join(os.homedir(), ".reddit");
const pidDir: string = path.join(ctxDir, "pid");
const userDataDir: string = path.join(ctxDir, "User Data");
const pendingDir: string = path.join(ctxDir, "pending");
const failedDir: string = path.join(ctxDir, "failed");
const doneDir: string = path.join(ctxDir, "done");
const scheduled: Record<string, { abort: () => void }> = {};
const running: Set<String> = new Set();

function scheduleFunction<TArgs extends any[]>(handler: (...args: TArgs) => any, time: number, ...args: TArgs): {
  abort: () => void
} {
  let interval: NodeJS.Timeout | null = null;
  let timeout: NodeJS.Timeout | null = null;
  if (time - Date.now() < 2147483647) {
    timeout = setTimeout<TArgs>(handler, time - Date.now(), ...args);
  } else {
    interval = setInterval(() => {
      if (time - Date.now() < 2147483647) {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        timeout = setTimeout<TArgs>(handler, time - Date.now(), ...args);
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

async function uploadFile(elementHandle: ElementHandle, dir: string, file: string, tempFiles: string[]): Promise<void> {
  if (/^https?:\/\//.test(file)) {
    const res = await fetch(file);
    const tempFile = path.join(os.tmpdir(), `${crypto.randomUUID()}.png`);
    const fileStream = createWriteStream(tempFile);
    if (res.body) {
      await finished(
          Readable.fromWeb(res.body).pipe(fileStream));
      await elementHandle.uploadFile(tempFile);
      tempFiles.push(tempFile);
    }
  } else {
    await elementHandle.uploadFile(path.resolve(pendingDir, dir, file));
  }
}

async function retry(iterations: number,
                     try_fn: () => any = () => {
                     },
                     catch_fn: (e: any) => any = () => {
                     },
                     finally_fn: () => any = () => {
                     }): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    try {
      await try_fn();
      return;
    } catch (e) {
      await catch_fn(e);
    } finally {
      await finally_fn();
    }
  }
  throw new Error("Retry failed");
}

async function post(browser: Browser, dir: string): Promise<void> {
  const logger = new Logger(path.join(pendingDir, dir, "output.log"), dir);
  logger.log("Starting");
  running.add(dir);
  const data: Data = JSON.parse(
      (await fs.readFile(path.join(pendingDir, dir, "data.json"))).toString());
  const tempFiles: string[] = [];
  const old = !data.images && !data.gif;
  logger.log("Opening page");
  const page = await browser.newPage();
  await page.setUserAgent(
      (await browser.userAgent()).replace(/headless/gi, ""));
  const iterations = (data.maxRetries ?? 0) + 1;
  try {
    let createdURL = "";
    await retry(iterations, async () => {
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
            const elementHandle = await page.locator('#image').waitHandle();
            if (data.file) {
              await uploadFile(elementHandle, path.resolve(pendingDir, dir), data.file, tempFiles);
            }
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
            const elementHandle = await page.locator('#image').waitHandle();
            if (data.file) {
              await uploadFile(elementHandle, path.resolve(pendingDir, dir),
                  data.file, tempFiles);
            }
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
            if (data.url) {
              await page.locator('#url').fill(data.url);
            }
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
            if (data.file) {
              await uploadFile(elementHandle, path.resolve(pendingDir, dir),
                  data.file, tempFiles);
            }
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
            if (data.images) {
              for (let i = 0; i < data.images.length; i++) {
                const image = data.images[i];
                const elementHandle = await page.locator(
                    '>>> input[type="file"][multiple="multiple"]').waitHandle();
                for (let j = 0; numImgs <= i && j < 10; j++) {
                  await uploadFile(elementHandle,
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
            }
            if (data.images && numImgs < data.images.length) {
              logger.error("Not enough images", data);
              return;
            }
            await page.locator('>>> button.edit-media').click();
            if (data.images) {
              if (data.imagges && data.images.some(({caption, link}) => caption || link)) {
                await page.locator(
                    `>>> .image-container:first-child button.btn-edit`).setTimeout(
                    10000).click();
                for (const image of data.images) {
                  if (image.caption) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    await page.locator('>>> textarea[name="caption"]').fill(image.caption);
                  }
                  if (image.link) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    await page.locator('>>> textarea[name="outboundUrl"]').fill(image.link);
                  }
                  await page.locator('>>> #media-carousel-next').click();
                }
                await page.locator('>>> #edit-gallery-modal-save').click();
                await page.locator(
                    '#post-composer_media >>>> edit-gallery-modal >>>> #edit-gallery-internal-modal [slot="footer"] button.button-primary').click();
              }
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
            if (data.file) {
              await uploadFile(elementHandle, path.resolve(pendingDir, dir),
                  data.file, tempFiles);
            }
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
            if (data.url) {
              await page.locator('>>> textarea[name="link"]').fill(data.url);
            }
          }
            break;
        }
        if (data.flair) {
          logger.log("Setting flair");
          await page.locator('>>> #reddit-post-flair-button').click();
          let allFlairs = await page.$('>>> #view-all-flairs-button');
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
      createdURL = created ? `https://old.reddit.com/${data.subreddit}/comments/${created.substring(
          3)}` : page.url();
      if (created) {
        createdURL = `https://old.reddit.com/${data.subreddit}/comments/${created.substring(3)}`;

        await page.goto(createdURL);
      } else {
        createdURL = page.url();
      }
    }, e => logger.error("Error", data, e));
    await retry(iterations, async () => {
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
      logger.log("Posted",
          page.url().replace("old.reddit.com", "www.reddit.com"), data);
    }, async e => {
      logger.error("Error", data, e);
      await page.goto(createdURL);
    });
    await fs.rename(path.join(pendingDir, dir), path.join(doneDir, dir));
  } catch (e) {
    logger.error("Error", data, e);
    await fs.rename(path.join(pendingDir, dir), path.join(failedDir, dir));
  } finally {
    await page.close();
    await logger.close();
    for (const tempFile of tempFiles) {
      await fs.rm(tempFile);
    }
    running.delete(dir);
  }
}

function schedule(browser: Browser, dir: string, retry = false): void {
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

async function scheduleAll(browser: Browser, retry = false): Promise<void> {
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

async function exit(this: Browser, signal: any): Promise<void> {
  console.log(process.pid, signal, "received, quitting");
  await this.close();
  await fs.rm(pidDir);
  process.exit();
}

(async (): Promise<void> => {
  await fs.mkdir(ctxDir, {recursive: true}).catch((): void => {
  });
  await fs.access(pidDir).then(async (): Promise<void> => {
    process.kill(parseInt((await fs.readFile(pidDir)).toString()));
    console.log(process.pid,
        "Another instance is running, stopping that instance");
    await new Promise(async (resolve: (value: void) => void): Promise<void> => {
      while (await fs.access(pidDir).then((): boolean => true, (): boolean => {
        resolve();
        return false;
      })) {
        await new Promise((resolve: (value: void) => void): NodeJS.Timeout => setTimeout(resolve, 1000));
      }
    });
  }, (): void => {
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
    headless: process.env.HEADLESS === "shell" ? "shell" : !["0", "false"].includes(process.env.HEADLESS ?? ""),
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
      await page.locator('input[name="username"]').fill(process.env.USERNAME ?? "");
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
      if (event.filename && !event.filename.startsWith(".")) {
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
