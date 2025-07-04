# Hene

This repository contains the Hene compiler and runtime package.

## Running the snapshot tests

Tests live outside the publishable package in the `tests/` directory. The root
`package.json` exposes a `npm test` command that compiles each source example and
compares it with its expected snapshot.

```bash
# install compiler dependencies and run the tests
npm test
```
