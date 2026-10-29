# Adding your app

1. Copy `_template/` to a new folder under `projects/`.
	- Name it in kebab-case after the app, for example `football-predictions` or `metric-tree`.
2. Put your app source in that folder.
3. Fill in the folder's `README.md`: one-line idea, demo link, video link, author.
4. Add one row to the table in the root `README.md`.
5. Open a pull request.

## Before you push

- No secrets, API keys or `.env` files.
- No real customer or internal data (sales, hiring, usage, Slack and so on). Use sample data instead.
- No `node_modules`, build output or large binaries.

## If your app already has its own repo

Copy the source over. Leave the old repo as it is.
