# Filter state URL

> Copy a link that opens the app with the same filters.

- Pattern id: `url-state`
- Category: Save & share
- Status: Proposed: anfra cannot do this yet (checked on 0.13.3: no write path, no query parameters, and the app frame allows scripts only, so no navigation or storage). Build the closest version and say what is missing
- Gallery card: https://anfra.ai/interaction-patterns/interaction-gallery.html#url-state
- Built on: @holistics/anfra-sdk 0.8.0, the `ecommerce` sample Dataset. Swap in your own fields.

## What the reader does

The reader presses **Share** and gets a link that encodes the snapshot. A colleague opens it and sees Japan, Q2 and weekly.

Why: Saying "look at this" works better with a link than with a set of instructions.

## What to build

Pressing Share turns the current view into text, and pasting that text back reopens the page with the same settings.

Layout: A URL bar that grows parameters as state changes.

Instruction: Let the reader copy the current view as text to send or keep, and paste it back to reopen the same view.

Done when: Pasting the copied text after changing filters brings back every filter and setting it held.

On the ecommerce sample: Share the view on Japan, Q2 and weekly, change the filters, then paste the text back: the page reopens on Japan, Q2 and weekly.

## AQL

Not run as written: no query change.

```aql
// same snapshot as "Bookmarks", carried by the host in the URL
```

## SDK wiring

```js
// Proposed (not real API):
// Anfra.state.write(snapshot());           host encodes into ?s=
// const s = Anfra.state.read(); if (s) restore(s);
// app.d.ts already notes: "a control set from a URL at startup is
// not an unapplied change"
```

## Notes

- Proposed: the host writes the snapshot to the URL and gives it back at startup
- Limits: Proposed. The SDK expects controls to be set at startup ("a control set from a URL at startup is not an unapplied change"), but anfra 0.8.0 has no URL API for the app.

## Walkthrough on the gallery card

1. Set the filters to **Japan**, Q2 and **week**
2. Press **Share**: the link gains a `?s=` part that holds the snapshot
3. Send the link to a colleague: it opens on Japan, Q2 and weekly

## Other Save & share patterns

- [Bookmarks](bookmarks.md): Save the current view and come back to it with one click.
- [Reset filters](reset.md): Clear one filter, or all of them, back to the defaults.
- [Undo / redo](undo-redo.md): Step back and forward through your filter and drill changes.
- [Saved views](saved-views.md): Keep named views that are still there next week, on any device.
- [Refresh & cache](refresh.md): Rerun the queries and see how fresh the data is.
