# Arcade card art

The two panels in the Arcade section of the home page are image slots. Replace
the file and the card updates — no code change.

| File | Card |
| --- | --- |
| `deathpit.png` | The Death Pit of Shem |
| `emberwing.png` | Emberwing |

The images currently in here are placeholders I generated. They are meant to be
replaced.

## Spec

**960 x 640 PNG (3:2).**

That comes from measuring the real panel rather than guessing. It renders at:

| Screen | Panel size | Ratio |
| --- | --- | --- |
| Desktop (container at its 1160px max) | 459 x 317 | 1.45 : 1 |
| Phone (375px, card stacked) | 317 x 190 | 1.67 : 1 |

The widest it is ever drawn is 459px, and the site is viewed at
devicePixelRatio 2, so 960 wide covers it with headroom. 640 tall at 3:2 sits
between the two ratios, so neither layout crops much.

Bigger is fine — it scales down cleanly. Smaller than 960 wide will look soft
on a retina screen.

### Safe zone

The panel uses `background-size: cover` anchored to the **top**, so the crop
falls on the sides on desktop and off the bottom on mobile.

- Keep the subject within the **central 90% horizontally**.
- Keep it within the **top 60% vertically**.

## The bottom third is covered

A dark scrim fades in over the lower third of the panel, and the wordmark, the
tagline and the "Free · No download" badge sit on top of it. Anything you put
in the bottom third will be behind type. Put the character high.

If you want the wordmark to come from your artwork instead of from the page,
say so — the `.arcade-wordmark` / `.arcade-tagline` / `.arcade-badge` elements
can be dropped from `index.html` and the whole panel left as your image.

## Palettes, if useful

- **Death Pit** — bioluminescent cavern: `#4de0c0` glow, `#b6ffee` bright,
  `#b678cb` violet, `#06121c` deep. The Plancktopus is slate blue `#2f4a72`
  with coral `#ef4b52`; Bob is yellow-green `#8cc63f`.
- **Emberwing** — ember sky: `#c9a83e` gold, `#f2cf72` bright gold,
  `#e0721f` fire, `#2c0d07` deep. The dragon is gold `#c8922f` / `#f2cf72`.

## Grabbing source stills from the game

The Death Pit can export a clean frame with no HUD. Load
`/games/deathpit/?debug` and in the console:

```js
DP.gotoLevel(6); DP.skipToBoss();     // 8 arms, the most dramatic fight
DP.posterScene();                     // pose Bob and the arms for a still
DP.poster();                          // renders and caches, returns length
```

Then read it back in chunks with `DP.poster(offset, length)`, or just screenshot
the canvas.
