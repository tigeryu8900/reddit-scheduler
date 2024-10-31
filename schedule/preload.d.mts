import { Data } from "../data.js";
import mime from "mime-types";
type FileEntry = {
    type: "url" | "path";
    data: string;
} | {
    type: "binary";
    data: ArrayBuffer;
};
export type Files = Record<string, FileEntry>;
declare const electronAPI: {
    getTmpdir(): Promise<string>;
    addFile(tmpdir: string, file: FileEntry, name: string): Promise<void>;
    finishSaveData(tmpdir: string, dir: string, data: Data): Promise<void>;
    close(): Promise<void>;
    mime: typeof mime;
    webUtils: Electron.WebUtils;
};
export type ElectronAPI = typeof electronAPI;
export {};
