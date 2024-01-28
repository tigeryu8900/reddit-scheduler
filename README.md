# reddit-scheduler

A Reddit scheduler for posts

## Set up

Create a `.env` file in the project root directory in this format where `username` and `password` are the Reddit
credentials. The `HEADLESS` variable, which is passed into Puppeteer, defaults to `new` if missing.

```dotenv
USERNAME=username
PASSWORD=password
HEADLESS=new
```

Then, create the `~/.reddit/pending/` directory.

Now, for each scheduled post, create a folder containing a string in the format `YYYY-mm-dd HH-MM-SS` in
`~/.reddit/pending/` where the folder name corresponds to the scheduled time. The folder name can include extra
characters as identification such as `2024-01-28 11-23-00 an interesting post`, which are ignored by the script.

Create a JSON file at `~/.reddit/pending/YYYY-mm-dd HH-MM-SS/data.json` with these fields:

| fields       | description                                                                                                              |
|--------------|--------------------------------------------------------------------------------------------------------------------------|
| `.subreddit` | The name of subreddit with the `r/` part. This could start with `u/` or `user/` instead if we're posting to a user page. |
| `.title`     | The title of the post.                                                                                                   |
| `.type`      | The type of post. Check the subsections below for more info.                                                             |
| `.oc`        | Whether or not to mark post as OC. Defaults to `false`.                                                                  |
| `.spoiler`   | Whether or not to mark post as spoiler. Defaults to `false`.                                                             |
| `.nsfw`      | Whether or not to mark post as NSFW. Defaults to `false`.                                                                |
| `.flair`     | A string representing the flair or `null` for no flair. Defaults to no flair.                                            |
| `.comments`  | An array of comments to add as strings, or `null` for no comments. Defaults to no comments.                              |

You can also refer to the [`data.schema.json`](https://github.com/tigeryu8900/reddit-scheduler/blob/main/data.schema.json)
schema file.

Here's an example `data.json`. `1.png` and `2.png` are in the same directory as `data.json`.

```json
{
  "subreddit": "r/subreddit",
  "title": "title",
  "type": "gallery",
  "images": [
    {
      "file": "1.png",
      "caption": "caption",
      "link": "https://example.com"
    },
    {
      "file": "2.png",
      "caption": null,
      "link": null
    }
  ],
  "oc": false,
  "spoiler": false,
  "nsfw": false,
  "flair": "flair",
  "comments": [
    "comment 1",
    "comment 2"
  ]
}
```

### Text posts

For text posts, the `.type` field should be `text` or `post`. Additionally, there are these fields:

| fields  | description                                |
|---------|--------------------------------------------|
| `.body` | The body of the post. Defaults to no body. |

### Image posts

For image posts, the `.type` field should be `image`. Additionally, there are these fields:

| fields  | description                                                  |
|---------|--------------------------------------------------------------|
| `.file` | The path to the file of the image relative to the JSON file. |

### Gallery posts

For gallery posts, the `.type` field should be `gallery` or `images`. Additionally, there are these fields:

| fields               | description                                                                |
|----------------------|----------------------------------------------------------------------------|
| `.images`            | An array specifying the file, caption, and link for each image.            |
| `.images[i].file`    | The path to the file of the image post relative to the JSON file.          |
| `.images[i].caption` | The caption of the image or `null` for no caption. Defaults to no caption. |
| `.images[i].link`    | The link of the image or `null` for no link. Defaults to no link.          |

### Video posts

For video posts, the `.type` field should be `video`. Additionally, there are these fields:

| fields            | description                                                                                    |
|-------------------|------------------------------------------------------------------------------------------------|
| `.file`           | The path to the file of the video relative to the JSON file.                                   |
| `.thumbnail`      | An integer from 1 to 10 inclusive indicating the thumbnail to choose. Defaults to first image. |
| `.gif`            | Whether or not to convert video to GIF. Defaults to `false`.                                   |

### Link posts

For link posts, the `.type` field should be `link` or `url`. Additionally, there are these fields:

| fields | description           |
|--------|-----------------------|
| `.url` | The url for the post. |

## Running

```shell
# To run in the foreground, run this
npm run start:fg

# To run in the background, run this
npm run start:bg
# or this
npm start

# To stop the script, run this
npm stop

# To reschedule all tasks in ~/.reddit/pending/, run this
npm run reschedule
```

If an instance is already running, that instance will be stopped.

New folders added to `~/.reddit/pending/` are automatically scheduled.

After the post is made, its folder will be moved to `~/.reddit/done/`, or if it failed, its folder will be moved to
`~/.reddit/failed/`.

### Running at startup

It may be useful to run this script at startup.

#### Windows

[Create a task in Task Scheduler](https://www.windowscentral.com/how-create-automated-task-using-task-scheduler-windows-10)
to run at log in with `npm` as the program and `start prefix=/path/to/reddit-scheduler` where `/path/to/reddit-scheduler`
is the path to the project root as the arguments.

#### macOS

Go to `System Settings > General > Login Items`, and add the `run.sh` script to `Open at Login`.

#### Linux

Create the file `~/.config/autostart/reddit-scheduler.desktop` with this content (remember to change the `Exec` path):

```
[Desktop Entry]
Type=Application
Name=reddit-scheduler
Exec=npm start prefix=/path/to/reddit-scheduler
StartupNotify=false
Terminal=false
```
