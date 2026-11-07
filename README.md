# bb-plugins

Monorepo for lqmanh BB plugins.

## Status

`plugins/sonora/` contains the Sonora plugin source.
`plugins/quiet-notices/` is the scaffold for the child-notice queue.

- `bb-plugin-opencode2` is intentionally excluded and stays in its own
  repository.
- No other plugin has been created yet.

## Layout

```text
bb-plugins/
├── .bb/
│   └── plugins.json
├── plugins/
│   ├── quiet-notices/   # child-notice queue scaffold
│   └── sonora/          # Sonora plugin
├── scripts/
│   └── run-all.sh
├── .gitignore
├── README.md
└── package.json
```

Each plugin lives in its own directory under `plugins/` with its own
`package.json`, lockfile, source, tests, and build. BB installs one plugin at a
time from a subdirectory, so plugins must not depend on the monorepo root's
`node_modules` or on sibling plugin source.

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

## Releases

Each plugin is versioned and tagged independently:

- `sonora/v0.1.0`
- future plugins: `<plugin>/vX.Y.Z`

Tags are never moved after a release.
