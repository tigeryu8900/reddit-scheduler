/* eslint-disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * This document records the details of a scheduled post
 */
export type Data = (
    | {
  type?: "text";
  [k: string]: unknown;
}
    | {
  type?: "post";
  [k: string]: unknown;
}
    | {
  type?: "image";
  [k: string]: unknown;
}
    | {
  type?: "gallery";
  [k: string]: unknown;
}
    | {
  type?: "images";
  [k: string]: unknown;
}
    | {
  type?: "video";
  [k: string]: unknown;
}
    | {
  type?: "link";
  [k: string]: unknown;
}
    | {
  type?: "url";
  [k: string]: unknown;
}
    ) & {
  /**
   * The name of subreddit with the `r/` part. This could start with `u/` or `user/` instead if we're posting to a user page.
   */
  subreddit: string;
  /**
   * The title of the post.
   */
  title: string;
  /**
   * The type of post.
   */
  type: string;
  /**
   * The body of the post. Defaults to no body.
   */
  body?: string | null;
  /**
   * The path to the file of the image or video relative to the JSON file.
   */
  file?: string;
  /**
   * An array specifying the file, caption, and link for each image.
   *
   * @minItems 2
   */
  images?: [
    {
      /**
       * The path to the file of the image post relative to the JSON file.
       */
      file: string;
      /**
       * The caption of the image or `null` for no caption. Defaults to no caption.
       */
      caption?: string | null;
      /**
       * The link of the image or `null` for no link. Defaults to no link.
       */
      link?: string | null;
      [k: string]: unknown;
    },
    {
      /**
       * The path to the file of the image post relative to the JSON file.
       */
      file: string;
      /**
       * The caption of the image or `null` for no caption. Defaults to no caption.
       */
      caption?: string | null;
      /**
       * The link of the image or `null` for no link. Defaults to no link.
       */
      link?: string | null;
      [k: string]: unknown;
    },
    ...{
      /**
       * The path to the file of the image post relative to the JSON file.
       */
      file: string;
      /**
       * The caption of the image or `null` for no caption. Defaults to no caption.
       */
      caption?: string | null;
      /**
       * The link of the image or `null` for no link. Defaults to no link.
       */
      link?: string | null;
      [k: string]: unknown;
    }[]
  ];
  /**
   * An integer from 1 to 10 inclusive indicating the thumbnail to choose. Defaults to first image.
   */
  thumbnail?: number;
  /**
   * Whether or not to convert video to GIF. Defaults to `false`.
   */
  gif?: boolean;
  /**
   * The url for the post.
   */
  url?: string;
  /**
   * Whether or not to mark post as OC. Defaults to `false`.
   */
  oc?: boolean;
  /**
   * Whether or not to mark post as spoiler. Defaults to `false`.
   */
  spoiler?: boolean;
  /**
   * Whether or not to mark post as nsfw. Defaults to `false`.
   */
  nsfw?: boolean;
  /**
   * A string representing the flair or `null` for no flair. Defaults to no flair.
   */
  flair?: string | null;
  /**
   * An array of comments to add as strings, or `null` for no comments. Defaults to no comments.
   */
  comments?: string[];
  /**
   * The maximum number of retries. Defaults to `0`.
   */
  maxRetries?: number;
  [k: string]: unknown;
};