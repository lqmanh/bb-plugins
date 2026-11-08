# bb-plugins

## Plugins

- [Sonora](plugins/sonora): show what Sonora is playing, in BB.
- [Quiet Notices](plugins/quiet-notices): hold child-thread notices in the
  parent thread's queue until you send them.
- [Mention Extras](plugins/mention-extras): mention more things in the
  composer, such as Tasks dispatch presets.

## Layout

```text
bb-plugins/
├── .bb/
│   └── plugins.json
├── plugins/
│   ├── mention-extras/  # extra composer mentions scaffold
│   ├── quiet-notices/   # child-notice queue scaffold
│   └── sonora/          # Sonora plugin
├── scripts/
│   └── run-all.sh
├── .gitignore
├── README.md
├── package.json
└── tsconfig.base.json
```

Each plugin lives in its own directory under `plugins/` with its own
`package.json`, lockfile, source, tests, and build. BB installs one plugin at a
time from a subdirectory, so a plugin's runtime dependencies, the Plugin SDK,
and the packages `bb plugin types` pins (React and its types) stay in the
plugin's own `package.json`. Plugins never import sibling plugin source.

Shared local dev tooling lives at the root: `typescript`, `vitest`,
`@types/node`, and `jsdom` in the root `package.json`; and the shared compiler
options in `tsconfig.base.json`, which each plugin's `tsconfig.json` extends.
Git installs skip dev dependencies, so these only affect local checks.

## Development

With one or more plugin packages present:

```sh
npm run install:all
npm run check
npm run build
npm run test
```

`scripts/run-all.sh` skips directories without a `package.json`, so the current
skeleton is a no-op.

## Install

Once a plugin is migrated and tagged:

```sh
bb plugin install 'git:git@github.com:lqmanh/bb-plugins.git@semver:^0.1.0' \
  --plugin sonora \
  --tag-prefix sonora/
```

For local development before tagging:

```sh
bb plugin install path:/Users/mluong-a/Projects/lqmanh/bb-plugins --plugin sonora
```
