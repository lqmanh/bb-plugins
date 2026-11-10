# Sonora

Show what Sonora is playing in BB.

## Thread backdrop

Settings → Plugins → Sonora → **Album art behind threads** draws the current
track's cover behind threads and the New thread screen. It is off by default.
The cover starts below the header fade and is strongest in the middle, fading
out before the composer.

Haze, Aura, and Aura Motion draw on the same panels. Turn them off while this
setting is on.

## Now-playing banner

Settings → Plugins → Sonora → **Show what's playing above the prompt box**
shows a slim banner above a thread's prompt box while the agent works. It has a
spinning record, the track and time, a lava lamp in the cover's colors,
playback controls, and a seekable progress bar.

The banner stops moving while the track is paused and hides when the turn ends.
It is thread-only, so it never appears on the New thread screen.

## Development

```sh
npm install
npm run check
```
