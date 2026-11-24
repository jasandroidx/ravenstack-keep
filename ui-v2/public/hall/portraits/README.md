# Talk-panel portraits

`lyra.jpg` is Lyra's stage 0 portrait (clothed, Gemini art made for the Keep).

## Swapping or adding Lyra's portrait stages

Lyra's talk-panel image is data-driven. The list lives in
`src/lib/hall/lyra.ts`:

```ts
stages: ["/hall/portraits/lyra.jpg"] as string[],
```

- **Swap stage 0:** replace `public/hall/portraits/lyra.jpg` with your own
  image (same name), or change the path in the array.
- **Add stages:** put more files here (for example `lyra-1.jpg`, `lyra-2.jpg`)
  and add their paths to the array in order.
- **Which stage shows:** the flag `lyra:stage` in the Keep's flag store
  (`localStorage["ravenstack.keep.flags.v1"]`). It defaults to 0. Out-of-range
  or bad values fall back to the nearest stage that exists. To test from the
  browser console, run `localStorage.setItem("ravenstack.keep.flags.v1",
  JSON.stringify({ ...__keepFlags(), "lyra:stage": 1 }))` and reload.
- Portrait-shaped images work best (lyra.jpg is 864x1152). The panel shows
  the whole image over a blurred copy of itself, so nothing gets cropped.

Nothing in the repo picks stages above 0 yet. Wiring choices to advance the
stage is a later step.
