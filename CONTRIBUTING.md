# Adding your app

1. Copy `_template/` to a new folder under `projects/`.
	- Name it in kebab-case after the app, for example `football-predictions` or `metric-tree`.
2. Put your app source in that folder.
3. Fill in the folder's `README.md`: one-line idea, demo link, author and video.
	- Upload the video to the [anfra YouTube channel](https://www.youtube.com/@anfra-ai), then put its ID in the template's thumbnail link. Do not link an mp4 file.
4. Add one row to the table in the root `README.md`.
5. Open a pull request.

## Before you push

- No secrets, API keys or `.env` files.
- No real customer or internal data (sales, hiring, usage, Slack and so on). Use sample data instead.
- No `node_modules`, build output or large binaries.

## If your app already has its own repo

Copy the source over. Leave the old repo as it is.
