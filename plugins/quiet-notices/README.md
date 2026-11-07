# bb-plugin-quiet-notices

Scaffold for **Quiet Notices**, a BB plugin that holds child-thread notices in
the parent thread's queue until you send them.

## Status

Scaffold only. The notice gate, queue controls, and composer modes are not
implemented yet.

## Development

```sh
npm install
npm run check
```

## Planned behavior

- Child-thread completion, failure, interruption, and needs-attention notices
  wait in the parent's queue.
- The parent agent is not woken until you release a notice.
- Send parked notices with your next prompt, on their own, or not at all.
