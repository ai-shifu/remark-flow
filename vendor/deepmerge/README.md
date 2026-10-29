# Development-only Deepmerge security fork

This directory contains the self-contained CommonJS bundle from
[deepmerge 4.3.1](https://github.com/TehShrike/deepmerge/tree/v4.3.1), with its MIT
license retained. The original `dist/cjs.js` SHA-256 is
`2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d`.

As of October 29, 2026,
[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) has no
patched upstream release. Jest 29 and 30 both depend on the affected library.
The root npm override resolves that dependency to this explicitly named private
fork, including installations that disable lifecycle scripts.

The patch discards the `__proto__` key in both the target and source copy loops.
This prevents either input from invoking the prototype setter on a newly created
object, including recursive merges with null, primitive, or null-prototype targets.
Other merge behavior, including own `constructor` and `prototype` data properties,
is retained. Formatting and removal of an unused catch binding are mechanical changes.

Run `npm run test:security` to verify poisoning regressions, normal merge behavior,
and resolution through Jest's actual dependency path. The CI and publish workflows
run these checks. Remove the fork and override once an upstream release fixes the
advisory and passes the same tests. This fork is only for development tooling and
is excluded from the published package's `files` list.
