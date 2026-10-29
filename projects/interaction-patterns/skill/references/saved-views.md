# Saved views

> Keep named views that are still there next week, on any device.

- Pattern id: `saved-views`
- Category: Save & share
- Status: Proposed: anfra cannot do this yet (checked on 0.13.3: no write path, no query parameters, and the app frame allows scripts only, so no navigation or storage). Build the closest version and say what is missing
- Gallery card: https://anfra.ai/interaction-patterns/interaction-gallery.html#saved-views
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader saves a view. Next week, on another device, it's in their list. Today a bookmark is lost when the frame reloads.

Why: A Data App people return to needs to remember their views.

## What to build

Saving a view stores its filters under a name, and picking that name from the list later brings the view back.

Layout: A saved-views menu.

Instruction: Let the reader save views under a name and reopen them from a list, for now only during the current visit.

Done when: A named view appears in the list and, clicked later in the same visit, brings back the settings it saved.

On the ecommerce sample: A view saved as Monday: APAC weekly appears under Views, and clicking it later in the same visit brings back its filters.

## AQL

Not run as written: no query change.

```aql
// persisted snapshot = same shape as a bookmark
```

## SDK wiring

```js
// Proposed (not real API):
// await Anfra.views.save('Monday: APAC weekly', snapshot());
// const views = await Anfra.views.list();
```

## Notes

- Proposed: host-side storage of snapshots, keyed by reader and app
- Limits: Proposed. API.md: "The origin is opaque: keep state in variables, since localStorage, sessionStorage and cookies throw."

## Walkthrough on the gallery card

1. Save the current view under a name, such as **Monday: APAC weekly**
2. Open the app next week on another device
3. Click **Views**: the saved view is still in your list, next to **Finance: FY27 Q1**
4. Click the view to bring it back

## Other Save & share patterns

- [Bookmarks](bookmarks.md): Save the current view and come back to it with one click.
- [Filter state URL](url-state.md): Copy a link that opens the app with the same filters.
- [Reset filters](reset.md): Clear one filter, or all of them, back to the defaults.
- [Undo / redo](undo-redo.md): Step back and forward through your filter and drill changes.
- [Refresh & cache](refresh.md): Rerun the queries and see how fresh the data is.
