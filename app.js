import puppeteer from "puppeteer";
import "dotenv/config";

import fs from "fs/promises";
import * as path from "path";
import os from "os";
import Logger from "./logger.js";

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

async function waitAndClick(page, selector) {
  await page.waitForSelector(selector);
  await page.evaluate(async btn => {
    for (let i = 0; i < 10 && btn.disabled; ++i) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    btn.click();
  }, await page.$(selector));
}

async function post(browser, dir) {
  const logger = new Logger(path.join(pendingDir, dir, "output.log"));
  logger.log(dir, "Starting");
  running.add(dir);
  const data = JSON.parse((await fs.readFile(path.join(pendingDir, dir, "data.json"))).toString());
  let success = false;
  for (let i = 0; i < (data.maxRetries || 0) + 1; ++i) {
    logger.log(dir, "Opening page");
    const page = await browser.newPage();
    try {
      const old = !data.images && !data.gif;
      await page.setUserAgent((await browser.userAgent()).replace(/headless/gi, ""));
      logger.log(dir, "Creating post");
      if (old) {
        await page.goto(`https://old.reddit.com/${data.subreddit}/submit`);
        logger.log(dir, "Adding title");
        await page.type('[name="title"]', data.title);
        switch (data.type) {
          case "text":
          case "post": {
            await page.click('.text-button');
            if (data.body) {
              logger.log(dir, "Adding body");
              await page.type('[name="text"]', data.body);
            }
          }
            break;
          case "image": {
            logger.log(dir, "Adding image");
            const elementHandle = await page.$('#image');
            await elementHandle.uploadFile(path.resolve(pendingDir, dir, data.file));
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
            logger.log(dir, "Adding video");
            const elementHandle = await page.$('#image');
            await elementHandle.uploadFile(path.resolve(pendingDir, dir, data.file));
            await elementHandle.dispose();
            let progress = "0%";
            while (progress !== "100%") {
              await page.waitForSelector(`#media-progress-bar:not([style*="width: ${progress}"])`);
              progress = await page.evaluate(
                  element => element ? element.style.width : progress,
                  await page.$(`#media-progress-bar:not([style*="width: ${progress}"])`),
                  progress
              );
            }
            await page.waitForSelector('[name="submit"]:not([disabled])');
            if (data.thumbnail) {
              logger.log(dir, "Choosing thumbnail");
              await waitAndClick(page, `.thumbnail-scroller > :nth-child(${data.thumbnail})`);
            }
            logger.assert(!data.gif, "posting videos as gifs aren't supported in old reddit");
          }
            break;
          case "url":
          case "link": {
            logger.log(dir, "Adding url");
            await page.type('#url', data.url);
          }
            break;
        }
        if (data.flair) {
          logger.log(dir, "Setting flair");
          await page.click('.flairselect-btn');
          await page.waitForSelector('.flairselector.active form');
          await page.click(`.flairselector.active .flairoptionpane [title=${JSON.stringify(data.flair)}]`);
          await page.click('.flairselector.active [type="submit"]');
        }
        await waitAndClick(page, '[name="submit"]');
        await page.waitForNavigation();
      } else {
        switch (data.type) {
          case "text":
          case "post": {
            await page.goto(`https://www.reddit.com/${data.subreddit}/submit?type=TEXT`);
            logger.log(dir, "Adding title");
            await page.type('>>> textarea[name="title"]', data.title);
            if (data.body) {
              logger.log(dir, "Adding body");
              let markdown = await page.$('>>> ::-p-xpath(//button[text()="Markdown Editor"])');
              if (markdown) {
                await markdown.click();
                await markdown.dispose();
              }
              await page.type('>>> [placeholder="Body"]', data.body);
            }
          }
            break;
          case "image": {
            await page.goto(`https://www.reddit.com/${data.subreddit}/submit?type=IMAGE`);
            logger.log(dir, "Adding title");
            await page.type('>>> textarea[name="title"]', data.title);
            logger.log(dir, "Adding image");
            let elementHandle = await page.$('>>> input[type="file"][multiple="multiple"]');
            await elementHandle.uploadFile(path.resolve(pendingDir, dir, data.file));
            await elementHandle.dispose();
          }
            break;
          case "gallery":
          case "images": {
            await page.goto(`https://www.reddit.com/${data.subreddit}/submit?type=IMAGE`);
            logger.log(dir, "Adding title");
            await page.type('>>> textarea[name="title"]', data.title);
            logger.log(dir, "Adding images");
            for (let image of data.images) {
              let elementHandle = await page.$('>>> input[type="file"][multiple="multiple"]');
              await elementHandle.uploadFile(path.resolve(pendingDir, dir, image.file));
              await elementHandle.dispose();
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            let divs = [];
            let time = Date.now();
            while (divs.length < data.images.length) {
              await page.click('>>> button.edit-media');
              if (Date.now() - time > 5000 * data.images.length) {
                logger.error(dir, "Not enough images", data);
                return;
              }
              divs = await page.$$('>>> .image-container button.btn-edit');
            }
            if (data.images.some(({caption, link}) => caption || link)) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              for (let i = 0; i < data.images.length; ++i) {
                await divs[i].click();
                await new Promise(resolve => setTimeout(resolve, 1000));
                if (data.images[i].caption) {
                  await page.type('>>> textarea[name="caption"]', data.images[i].caption);
                }
                if (data.images[i].link) {
                  await page.type('>>> textarea[name="outboundUrl"]', data.images[i].link);
                }
                await page.click('>>> #edit-gallery-modal-save');
              }
              await new Promise(resolve => setTimeout(resolve, 1000));
              await page.click('#post-composer_media >>>> edit-gallery-modal >>>> #edit-gallery-internal-modal [slot="footer"] button.button-primary');
            }
          }
            break;
          case "video": {
            await page.goto(`https://www.reddit.com/${data.subreddit}/submit?type=IMAGE`);
            logger.log(dir, "Adding title");
            await page.type('>>> textarea[name="title"]', data.title);
            logger.log(dir, "Adding video");
            let elementHandle = await page.$('>>> input[type="file"][multiple="multiple"]');
            await elementHandle.uploadFile(path.resolve(pendingDir, dir, data.file));
            await elementHandle.dispose();
            await page.waitForSelector('>>> button.edit-media', {
              timeout: 5 * 60 * 1000
            });
            if (data.thumbnail || data.gif) {
              await page.click('>>> button.edit-media');
              await new Promise(resolve => setTimeout(resolve, 1000));
              if (data.thumbnail) {
                logger.log(dir, "Choosing thumbnail");
                await waitAndClick(page, `>>> .thumbnail:nth-child(${data.thumbnail})`);
              }
              if (data.gif) {
                await page.click('#post-composer_media >>>> edit-video-modal >>>> #edit-video-internal-modal faceplate-checkbox-input');
              }
              await page.click('#post-composer_media >>>> edit-video-modal >>>> #edit-video-internal-modal [slot="footer"] button.button-primary');
            }
          }
            break;
          case "url":
          case "link": {
            await page.goto(`https://www.reddit.com/${data.subreddit}/submit?type=LINK`);
            logger.log(dir, "Adding title");
            await page.type('>>> textarea[name="title"]', data.title);
            logger.log(dir, "Adding url");
            await page.type('>>> textarea[name="link"]', data.url);
          }
            break;
        }
        if (data.flair) {
          logger.log(dir, "Setting flair");
          await page.click('>>> #reddit-post-flair-button');
          let allFlairs = await page.$('>>> #view-all-flairs-button');
          if (allFlairs) {
            await allFlairs.click();
          }
          await page.$$eval('>>> [aria-label="Post Flair Selection form"] [name="flairId"] >>> span',
              async (elements, flair) => {
            console.log(elements, flair);
            elements.find(element => element.innerText === flair).click();
          }, data.flair);
          await page.click('>>> button.apply');
        }
        await waitAndClick(page, '>>> #inner-post-submit-button');
        await page.waitForNavigation();
      }
      await page.goto(page.url().replace("www.reddit.com", "old.reddit.com"));
      logger.log(dir, "Setting tags");
      if (data.oc) {
        const oc = await page.$('.buttons [data-event-action="markoriginalcontent"]');
        if (oc) {
          await oc.click();
          await page.click('.buttons form:has([data-event-action="markoriginalcontent"]) .yes');
        }
      }
      if (data.spoiler) {
        const spoiler = await page.$('.buttons [data-event-action="spoiler"]');
        if (spoiler) {
          await spoiler.click();
          await page.click('.buttons form:has([data-event-action="spoiler"]) .yes');
        }
      }
      if (data.nsfw) {
        const nsfw = await page.$('.buttons [data-event-action="marknsfw"]');
        if (nsfw) {
          await nsfw.click();
          await page.click('.buttons form:has([data-event-action="marknsfw"]) .yes');
        }
      }
      if (data.comments) {
        logger.log(dir, "Adding comments");
        for (let comment of data.comments) {
          await page.waitForSelector('form.cloneable [name="text"]');
          await page.type('form.cloneable [name="text"]', comment);
          await page.click('form.cloneable [type="submit"]');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      success = true;
      logger.log(dir, "Posted", page.url().replace("old.reddit.com", "www.reddit.com"), data);
      break;
    } catch (e) {
      logger.error(dir, "Error", data, e);
    } finally {
      await page.close();
      await logger.close();
    }
  }
  await fs.rename(path.join(pendingDir, dir), path.join(success ? doneDir : failedDir, dir));
  running.delete(dir);
}

function schedule(browser, dir, retry = false) {
  try {
    const time = Date.parse(dir.replace(
        /^.*?(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2})-(\d{1,2})-(\d{1,2})(?!\d).*$/, "$1-$2-$3T$4:$5:$6"));
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
  await fs.mkdir(ctxDir, {recursive: true}).catch(() => {});
  await fs.access(pidDir).then(async () => {
    process.kill(parseInt((await fs.readFile(pidDir)).toString()));
    console.log(process.pid, "Another instance is running, stopping that instance");
    await new Promise(async resolve => {
      while (await fs.access(pidDir).then(() => true, () => {
        resolve();
        return false;
      })) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    });
  }, () => {}).catch(() => {
    console.log(process.pid, "Previous instance crashed. You should check the logs.");
  });
  await fs.writeFile(pidDir, process.pid.toString());
  console.log(process.pid, "Starting", Date());
  await fs.mkdir(userDataDir, {recursive: true}).catch(() => {});
  await fs.mkdir(pendingDir, {recursive: true}).catch(() => {});
  await fs.mkdir(failedDir, {recursive: true}).catch(() => {});
  await fs.mkdir(doneDir, {recursive: true}).catch(() => {});
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
  for (let event of ["SIGHUP", "SIGINT", "SIGTERM", "uncaughtException", "unhandledRejection"]) {
    process.once(event, exit.bind(browser));
  }
  const page = await browser.newPage();
  await page.setUserAgent((await browser.userAgent()).replace(/headless/gi, ""));
  console.log(process.pid, "Signing in");
  await page.goto("https://www.reddit.com/login/");
  try {
    await page.type('input[name="username"]', process.env.USERNAME);
    await page.type('input[name="password"]', process.env.PASSWORD + "\n");
    await page.waitForNetworkIdle();
    console.log(process.pid, "Signed in");
  } catch (e) {
    console.log(process.pid, "Skipping sign in");
  }
  await page.close();
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
