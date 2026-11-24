---
name: code
description: Implements a change in the Availability repo. Reads the conventions in instructions/ and the code the change touches, then writes the code and its tests. Use for any request to add, change or fix code in this repository. It is the first step of the code → verify → ship pipeline, so use it before writing any code here, including when the request does not name it.
---

# Code

Turn the spec for this change into code that follows this repository's conventions. Do the steps in order. Nothing is written before the reading in steps 2 and 3 is done.

## 1. Fix the spec

The spec is the first user message in the chat. Later messages refine it.

Read the sections of `SPEC.md` that the spec touches. `SPEC.md` is the product being built; the first message says which part of it this change delivers.

Ask before coding when either is true:

- The spec leaves open a decision that `SPEC.md` does not settle.
- The spec contradicts `SPEC.md`. Say which section, and ask whether `SPEC.md` should change too.

## 2. Read the conventions

Read `instructions/README.md`. It lists every convention file and what each covers. Then read each file that applies to the change. `instructions/invariants.md` applies to every change.

## 3. Read the code

Read the files the change will touch, the code that calls them and their tests. Where existing code and your defaults differ, follow the existing code.

If the code the change needs does not exist yet, read its nearest neighbour for layout and naming.

## 4. Write the change

- Write the code and its tests together.
- Stay inside the spec. Report anything else you find instead of fixing it.
- If an invariant in `instructions/invariants.md` blocks the spec, stop and say so. Do not work around it.

## 5. Record new conventions

If the change made a decision that later changes must follow (a directory layout, a naming rule, a command, a pattern for a new kind of file), add it to `instructions/` and to the index in `instructions/README.md`, in the same change. Record only decisions the code now shows. Do not write rules for code that does not exist.

## 6. Hand over to verify

Leave the changes uncommitted. Report what changed and which behaviours the verify step should observe. The verify step follows; see `CLAUDE.md`.
