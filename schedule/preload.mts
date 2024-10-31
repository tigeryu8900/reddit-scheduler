import {Data} from "../data.js";
import {contextBridge, ipcRenderer, webUtils} from "electron";
import mime from "mime-types";
import path from "path";
import os from "os";
import crypto from "crypto";
import fs from "fs/promises";
import {fetch} from "undici";
import {createWriteStream} from "fs";
import {finished} from "stream/promises";
import {Readable} from "stream";

function callMain<RType>(method: string, ...args: any[]): Promise<RType> {
  return new Promise(async resolve => {
    const nonce = Math.random().toString(16).substring(2);
    ipcRenderer.send(method, nonce, ...args);
    ipcRenderer.once(`${method}:${nonce}`, (_event, result) => resolve(result));
  });
}

const pendingDir: string = path.join(os.homedir(), ".reddit", "pending");

type FileEntry = {
  type: "url" | "path";
  data: string;
} | {
  type: "binary";
  data: ArrayBuffer;
};

export type Files = Record<string, FileEntry>;

const electronAPI = {
  async getTmpdir() {
    const tmpdir = path.join(os.tmpdir(), crypto.randomUUID());
    await fs.mkdir(tmpdir, {recursive: true});
    return tmpdir;
  },
  async addFile(tmpdir: string, file: FileEntry, name: string): Promise<void> {
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
        await fs.writeFile(path.join(tmpdir, name), Buffer.from(file.data));
        break;
    }
  },
  async finishSaveData(tmpdir: string, dir: string, data: Data): Promise<void> {
    await fs.writeFile(path.join(tmpdir, "data.json"), JSON.stringify(data, null, 2));
    await fs.rename(tmpdir, path.join(pendingDir, dir));
  },
  close(): Promise<void> {
    return callMain<void>("close");
  },
  mime: mime,
  webUtils: webUtils
};

export type ElectronAPI = typeof electronAPI;

contextBridge.exposeInMainWorld("electronAPI", electronAPI);
