# Release checks

Run these checks before preparing an App Store build:

```sh
npm run check
npm run test:unit
npm run build
```

## TypeScript baseline

`npm run check` is a release gate, not a blanket suppression. It runs the
normal TypeScript compiler and allows only exact diagnostic fingerprints from
the checked-in snapshot in `scripts/typecheck-baseline.json`. A new error fails
the gate even when it appears in a file that already has legacy errors.

The project has an existing type-error backlog concentrated in the legacy
server router and a small number of older client and Studio modules. Those
paths are intentionally quarantined so unrelated release work has a useful
green/red signal today. The baseline script reports how many known diagnostics
remain; it does not alter the compiler configuration or ignore diagnostics in
every other source file. Resolved baseline entries are reported as progress and
do not block the check.

Use the following command when working on a quarantined module:

```sh
npm run check:legacy
```

Fix its diagnostics and remove their entries from the baseline snapshot once
they are clean. Do not add new entries merely to make a release green: correct
the new type issue or get explicit approval to classify it as pre-existing
legacy debt.

The main compiler configuration targets ES2020 and includes the installed
Google Maps declarations. This prevents false diagnostics from an ES5 default
target and the previous restrictive `types` allow-list.