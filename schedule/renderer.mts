/// <reference types="jquery" />

import {Data} from "../data.js";
import {ElectronAPI, Files} from "./preload.mjs";

type Input<Type extends string> = HTMLInputElement & { type: Type };

const {electronAPI}: { electronAPI: ElectronAPI } = globalThis as any;

$(function () {
  const type = $<Input<"hidden">>('#type');

  function getType(): "text" | "post" | "image" | "gallery" | "images" | "video" | "link" | "url" {
    switch (type.val()) {
      case "text":
        return "text";
      case "post":
        return "post";
      case "image":
        return "image";
      case "gallery":
        return "gallery";
      case "images":
        return "images";
      case "video":
        return "video";
      case "link":
        return "link";
      case "url":
        return "url";
      default:
        return "text";
    }
  }

  const imageFile = $<Input<"file">>('#image-file');
  const imagePath = $<Input<"text">>('#image-path');
  const imagePreview = $<HTMLImageElement>('#image-preview');
  const addImage = $<HTMLButtonElement>('#add-image');
  const clearImages = $<HTMLButtonElement>('#clear-images');
  const images = $<HTMLDivElement>('#images');
  const videoFile = $<Input<"file">>('#video-file');
  const videoPath = $<Input<"text">>('#video-path');
  const videoPreview = $<HTMLVideoElement>('#video-preview');
  const thumbnail = $<Input<"number">>('#thumbnail');
  const schedule = $<HTMLButtonElement>('#schedule');
  const comments = $<HTMLDivElement>('#comments');
  const addComment = $<HTMLButtonElement>('#add-comment');
  const clearComments = $<HTMLButtonElement>('#clear-comments');
  const errorModal = $<HTMLDivElement>('#error-modal');
  const submitModal = $<HTMLDivElement>('#submit-modal');
  const doneModal = $<HTMLDivElement>('#done-modal');

  $('#post-tab').on("click", () => type.val("post"));
  $('#image-tab').on("click", () => type.val("image"));
  $('#gallery-tab').on("click", () => type.val("gallery"));
  $('#video-tab').on("click", () => type.val("video"));
  $('#link-tab').on("click", () => type.val("link"));

  const date = new Date();
  $('#dir').val(`${
      date.getFullYear().toString().padStart(4, "0")
  }-${
      (date.getMonth() + 1).toString().padStart(2, "0")
  }-${
      date.getDate().toString().padStart(2, "0")
  } ${
      date.getHours().toString().padStart(2, "0")
  }-${
      date.getMinutes().toString().padStart(2, "0")
  }-${
      date.getSeconds().toString().padStart(2, "0")
  }`);

  function handleImage(imageFile: JQuery<Input<"file">>, imagePath: JQuery<Input<"text">>, imagePreview: JQuery<HTMLImageElement>) {
    function updateImageSrc(): void {
      const val = imagePath.val();
      const files = imageFile.prop("files");
      if (val?.length) {
        imagePreview.attr("src", val);
        imageFile.val("");
      } else if (files.length) {
        const path = electronAPI.webUtils.getPathForFile(files[0]);
        imagePreview.attr("src", path.length ? path : URL.createObjectURL(files[0]));
      } else {
        imagePreview.attr("src",
            "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==");
      }
    }

    imageFile.on("change", updateImageSrc);
    imagePath.on("change", updateImageSrc);
  }

  handleImage(imageFile, imagePath, imagePreview);

  function createGalleryCard() {
    const card = $(String.raw`
      <div class="card col-6">
        <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="
             class="card-img-top image-preview" alt="image preview">
        <div class="card-body">
          <div class="input-group mb-3">
            <input name="image-file" type="file" class="form-control image-file">
          </div>
          <div class="input-group mb-3">
            <span class="input-group-text">or</span>
            <input name="image-path" type="text" class="form-control image-path" aria-label="File URL or file path"
                   placeholder="/path/to/image.png or https://example.com/image.png">
          </div>
          <div class="input-group mb-3">
            <input name="caption" type="text" class="form-control caption" aria-label="Caption" placeholder="Caption">
          </div>
          <div class="input-group mb-3">
            <input name="link" type="url" class="form-control link" aria-label="Link" placeholder="Link">
          </div>
        </div>
        <div class="card-footer">
          <div class="btn-group w-100" role="group">
            <button class="btn btn-primary left"><i class="bi bi-arrow-left"></i></button>
            <button class="btn btn-primary add-left">
              <i class="bi bi-arrow-left"></i>
              <i class="bi bi-plus-square"></i>
            </button>
            <button class="btn btn-primary delete"><i class="bi bi-trash"></i></button>
            <button class="btn btn-primary add-right">
              <i class="bi bi-plus-square"></i>
              <i class="bi bi-arrow-right"></i>
            </button>
            <button class="btn btn-primary right"><i class="bi bi-arrow-right"></i></button>
          </div>
        </div>
      </div>
    `);

    const imageFile = card.find<Input<"file">>('.image-file');
    const imagePath = card.find<Input<"text">>('.image-path');
    const imagePreview = card.find<HTMLImageElement>('.image-preview');

    handleImage(imageFile, imagePath, imagePreview);

    card.find('.left').on("click", function () {
      card.insertBefore(card.prev());
    });
    card.find('.add-left').on("click", function () {
      card.before(createGalleryCard());
    });
    card.find('.delete').on("click", function () {
      card.remove();
    })
    card.find('.add-right').on("click", function () {
      card.after(createGalleryCard());
    });
    card.find('.right').on("click", function () {
      card.insertAfter(card.next());
    });

    return card;
  }

  addImage.on("click", function () {
    images.append(createGalleryCard());
  });

  clearImages.on("click", function () {
    images.empty();
  });

  function updateVideoSrc(): void {
    const val = videoPath.val();
    const files = videoFile.prop("files");
    if (val?.length) {
      videoPreview.attr("src", val);
      videoFile.val("");
    } else if (files.length) {
      const path = electronAPI.webUtils.getPathForFile(files[0]);
      videoPreview.attr("src", path.length ? path : URL.createObjectURL(files[0]));
    } else {
      videoPreview.attr("src",
          "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==");
    }
  }

  videoFile.on("change", updateVideoSrc);
  videoPath.on("change", updateVideoSrc);

  thumbnail.on("change", function () {
    videoPreview.prop("currentTime",
        videoPreview.prop("duration") * (parseInt(thumbnail.val() ?? "0") - 1) / 9);
  });

  function updateFileInput(fileInput: JQuery<Input<"file">>, pathInput: JQuery<Input<"text">>, file: File): void {
    fileInput.val("");
    pathInput.val("");
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.prop("files", dataTransfer.files);
    fileInput.trigger("change");
  }

  function updatePathInput(fileInput: JQuery<Input<"file">>, pathInput: JQuery<Input<"text">>, path: string): void {
    fileInput.val("");
    pathInput.val(path);
    pathInput.trigger("change");
  }

  const pathHandlers: Record<string, (path: string) => void> = {
    post(): void {
    },
    image(path: string): void {
      updatePathInput(imageFile, imagePath, path);
    },
    gallery(path: string): void {
      const card = createGalleryCard();
      images.append(card);
      updatePathInput(card.find('.image-file'), card.find('.image-path'), path);
    },
    video(path: string): void {
      updatePathInput(videoFile, videoPath, path);
    }
  };

  const fileHandlers: Record<string, (file: File) => void> = {
    post(): void {
    },
    image(file: File): void {
      updateFileInput(imageFile, imagePath, file);
    },
    gallery(file: File): void {
      const card = createGalleryCard();
      images.append(card);
      updateFileInput(card.find('.image-file'), card.find('.image-path'), file);
    },
    video(file: File): void {
      updateFileInput(videoFile, videoPath, file);
    }
  };

  $(document.documentElement).on("dragover", function (e) {
    e.preventDefault();
    e.stopPropagation();
    $(this).addClass("dragging");
  });

  $(document.documentElement).on("dragleave", function (e) {
    e.preventDefault();
    e.stopPropagation();
    $(this).removeClass("dragging");
  });

  function itemHandler(item: DataTransferItem, urisHandler: (uris: string) => void, fileHandler: (file: File) => void) {
    switch (item.kind) {
      case "string":
        switch (item.type) {
          case "text":
          case "text/plain":
          case "text/uri-list":
            item.getAsString(urisHandler);
            return true;
        }
        break;
      case "file": {
        const file = item.getAsFile();
        if (file) {
          fileHandler(file);
          return true;
        } else {
          return false;
        }
      }
    }
    return false;
  }

  function itemsHandler(items: Iterable<DataTransferItem>) {
    let handled = false;
    for (let item of items) {
      const val = type.val();
      if (val) {
        const pathHandler = pathHandlers[val];
        const fileHandler = fileHandlers[val];
        if (pathHandler && fileHandler && itemHandler(item,
            uris => uris.split('\n').forEach(pathHandler), fileHandler)) {
          handled = true;
        }
      }
    }
    return handled;
  }

  $(document.documentElement).on("drop dragdrop paste", e => {
    const originalEvent = e?.originalEvent;
    let items: DataTransferItemList | null = null;
    if (originalEvent instanceof DragEvent) {
      items = originalEvent.dataTransfer?.items ?? null;
    } else if (originalEvent instanceof ClipboardEvent) {
      items = originalEvent.clipboardData?.items ?? null;
    }
    if (items && items.length) {
      const target = $(e.target);
      if (target.is('img, video')) {
        const item = items[0];
        const ancestor = target.closest(':has(input[type="file"]):has(input[id$="path"])');
        const fileInput = ancestor.find<Input<"file">>('input[type="file"]');
        const pathInput = ancestor.find<Input<"text">>('input[id$="path"]');
        fileInput.val("");
        pathInput.val("");
        if (itemHandler(item,
            uris => updatePathInput(fileInput, pathInput, uris.split('\n', 1)[0]),
            file => updateFileInput(fileInput, pathInput, file))) {
          e.preventDefault();
        }
      } else if (e.type === "paste") {
        if (!target.is(
                'input:not([type="file"]), textarea, div[contenteditable="plaintext-only"]')
            && itemsHandler(items)) {
          e.preventDefault();
        }
      } else {
        itemsHandler(items);
        e.preventDefault();
      }
    }
  });

  function createComment() {
    const comment = $(String.raw`
        <div class="input-group mb-3" id="image">
          <span class="input-group-text">Comment</span>
          <div class="form-control comment" aria-label="Comment" contenteditable="plaintext-only"></div>
          <button class="btn btn-primary up" type="button"><i class="bi bi-arrow-up"></i></button>
          <button class="btn btn-primary down" type="button"><i class="bi bi-arrow-down"></i></button>
          <button class="btn btn-primary add-above" type="button">
            <i class="bi bi-plus-square"></i>
            <i class="bi bi-arrow-up"></i>
          </button>
          <button class="btn btn-primary add-below" type="button">
            <i class="bi bi-plus-square"></i>
            <i class="bi bi-arrow-down"></i>
          </button>
          <button class="btn btn-primary delete" type="button"><i class="bi bi-trash"></i></button>
        </div>
      `);
    comment.find('.up').on("click", function () {
      comment.insertBefore(comment.prev());
    });
    comment.find('.down').on("click", function () {
      comment.insertAfter(comment.next());
    });
    comment.find('.add-above').on("click", function () {
      comment.before(createComment());
    });
    comment.find('.add-below').on("click", function () {
      comment.after(createComment());
    });
    comment.find('.delete').on("click", function () {
      comment.remove();
    });
    return comment;
  }

  addComment.on("click", function () {
    comments.append(createComment());
  });

  clearComments.on("click", function () {
    comments.empty();
  });

  function uniqueName(name: string, files: Files) {
    let [, base, ext] = name.match(/^(.*?)(\..*)?$/) ?? [];
    for (let i = 2; name in files; ++i) {
      name = `${base} ${i}${ext}`;
    }
    files[name] = {
      type: "url",
      data: ""
    };
    return name;
  }

  async function handleFile(path: string | undefined, file: File | undefined, files: Files) {
    if (path) {
      if (path.startsWith("file://")) {
        path = decodeURIComponent(path.substring("file://".length));
        const name = uniqueName((path.match(/[^\/]*$/) ?? [""])[0], files);
        files[name] = {
          type: "path",
          data: path
        };
        return name;
      } else if (/^https?:\/\//.test(path)) {
        const res = await fetch(path, {
          mode: "no-cors"
        });
        const base = (path.match(/[^\/]*$/) ?? [""])[0].replaceAll(/[^a-zA-Z0-9_\-.]/g, "_");
        const ext = electronAPI.mime.extension(res.headers.get("Content-Type") ?? "image/png") || "png";
        const name = base.endsWith(`.${ext}`) ? base : `${base}.${ext}`;
        files[name] = {
          type: "url",
          data: path
        };
        return name;
      } else {
        const name = uniqueName((path.match(/[^\/\\]*$/) ?? [""])[0], files);
        files[name] = {
          type: "path",
          data: path
        };
        return name;
      }
    } else if (file) {
      const name = uniqueName(file.name, files);
      const path = electronAPI.webUtils.getPathForFile(file);
      files[name] = path.length ? {
        type: "path",
        data: path
      } : {
        type: "binary",
        data: await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target?.result as ArrayBuffer);
          reader.readAsArrayBuffer(file);
        })
      };
      return name;
    }
  }

  function reject(message: string): Promise<void> {
    errorModal.find('.modal-body').text(message);
    return new Promise((_resolve, reject) => {
      errorModal.find('.btn-close').prop("onclick", () => reject);
      errorModal.find('#error-modal-ok').prop("onclick", () => reject);
      errorModal.modal("show");
    });
  }

  schedule.on("click", async function () {
    let data: Data = {
      subreddit: $<Input<"text">>('#subreddit').val() ?? "",
      title: $<Input<"text">>('#title').val() ?? "",
      type: getType()
    };
    if (!/^(?:r\/[\w_]{3,21}|(?:u|user)\/[\w\-_]{3,20})$/.test(data.subreddit)) {
      await reject("Wrong or missing subreddit.");
    }
    if (!data.title.length) {
      await reject("Missing title.");
    }
    const files: Files = {};
    switch (data.type) {
      case "text":
      case "post": {
        const body = $<HTMLTextAreaElement>('#body');
        const val = body.val();
        if (val) {
          data.body = val;
        }
      }
        break;
      case "image":
        data.file = await handleFile(imagePath.val(), imageFile.prop("files")[0], files);
        if (!data.file) {
          await reject("Missing image.");
        }
        break;
      case "gallery":
      case "images": {
        const imageArray = (await Promise.all(images.children().map(async function () {
          const card = $(this);
          const imageFile = card.find<Input<"file">>('.image-file');
          const imagePath = card.find<Input<"text">>('.image-path');
          const caption = card.find<Input<"text">>('.caption');
          const link = card.find<Input<"text">>('.link');
          const captionVal = caption.val();
          const linkVal = link.val();
          const image: {
            file: string;
            caption?: string | null;
            link?: string | null;
          } = {
            file: await handleFile(imagePath.val(), imageFile.prop("files")[0], files) ?? ""
          };
          if (captionVal) {
            image.caption = captionVal;
          }
          if (linkVal) {
            image.link = linkVal;
          }
          return image;
        }))).filter(image => image.file);
        if (images.length < 2) {
          await reject("Not enough images.");
        }
        if (images.length > 20) {
          await reject("Too many images.");
        }
        data.images = [
          imageArray[0],
          imageArray[1],
          ...imageArray.slice(2),
        ];
      }
        break;
      case "video": {
        data.file = await handleFile(videoPath.val(), videoFile.prop("files")[0], files);
        if (!data.file) {
          await reject("Missing video.");
        }
        data.gif = $<Input<"checkbox">>('#gif').prop("checked");
        const thumbnailVal = thumbnail.val();
        if (thumbnailVal) {
          data.thumbnail = parseInt(thumbnailVal);
        }
      }
        break;
      case "url":
      case "link":
        data.url = $<Input<"text">>('#url').val();
        if (!data.url) {
          await reject("Missing url.");
        }
        break;
    }
    data.oc = $<Input<"checkbox">>('#oc').prop("checked");
    data.spoiler = $<Input<"checkbox">>('#spoiler').prop("checked");
    data.nsfw = $<Input<"checkbox">>('#nsfw').prop("checked");
    const flair = $<Input<"text">>('#flair');
    const flairVal = flair.val();
    if (flairVal) {
      data.flair = flairVal;
    }
    const retries = $<Input<"number">>('#retries');
    const retriesVal = retries.val();
    if (retriesVal) {
      data.maxRetries = parseInt(retriesVal);
    }
    const commentElems = comments.find('.comment');
    if (commentElems.length) {
      data.comments = [...commentElems.map(function () {
        return $(this).prop("innerText");
      })].filter(comment => /\S/.test(comment));
    }

    async function saveData(dir: string, data: Data, files: Files): Promise<void> {
      const tmpdir = await electronAPI.getTmpdir();
      await Promise.all(Object.entries(files).map(([name, file]) => electronAPI.addFile(tmpdir, file, name)));
      await electronAPI.finishSaveData(tmpdir, dir, data);
    }

    const pre = submitModal.find('.modal-body pre');
    pre.text(JSON.stringify(data, null, 2));
    await new Promise((resolve, reject) => {
      submitModal.find('.btn-close').prop("onclick", () => reject);
      submitModal.find('#submit-modal-cancel').prop("onclick", () => reject);
      submitModal.find('#submit-modal-ok').prop("onclick", () => resolve);
      submitModal.modal("show");
    });
    data = JSON.parse(pre.text());
    const dir = $<Input<"text">>('#dir').val() ?? "";
    await saveData(dir, data, files);
    doneModal.find('#done-modal-label').text(`${dir} scheduled!`);
    doneModal.find('.modal-body pre').text(JSON.stringify(data, null, 2));
    await new Promise(resolve => {
      doneModal.find('.btn-close').prop("onclick", () => resolve);
      doneModal.find('#done-modal-ok').prop("onclick", () => resolve);
      doneModal.modal("show");
    });
    await electronAPI.close();
  });
});
