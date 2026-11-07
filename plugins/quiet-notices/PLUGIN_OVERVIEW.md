Hold child-thread notices in the parent's queue until you send them.

## What you get

- Child-thread completion, failure, interruption, and needs-attention notices
  wait in the parent thread's queue instead of waking the parent.
- Send parked notices with your next prompt, on their own, or not at all.
- The built-in notice text and thread mention are preserved when released.

## Status

This is a scaffold. The behavior above is not implemented yet.
