# `hatlabs/homarr` fork

This repository is a fork of [`homarr-labs/homarr`](https://github.com/homarr-labs/homarr)
maintained by Hat Labs to ship the Homarr container that powers
[HaLOS](https://halos.fi).

The fork carries a small set of patches that have not yet landed upstream.
Patches are kept on top of clean upstream release tags so they can be carried
forward by rebase rather than merge.

## Tag scheme

Fork release images are tagged as `v<upstream>-halos.<n>`:

- `<upstream>` — the upstream Homarr release the fork was rebased onto
  (e.g. `v1.59.3`).
- `<n>` — fork iteration number (1-based) on top of that upstream release.

Example: `v1.59.3-halos.1` is the first fork release built on top of
upstream `v1.59.3`.

When upstream cuts a new release the fork rebases its branch onto it and the
counter resets:

```
v1.59.3-halos.1   first fork release on v1.59.3
v1.59.3-halos.2   second fork release (still on v1.59.3)
v1.59.4-halos.1   first fork release after rebasing onto v1.59.4
```

## Container images

Images are built by `.github/workflows/deployment-fork-image.yml` and pushed to
`ghcr.io/hatlabs/homarr`:

- `ghcr.io/hatlabs/homarr:v<upstream>-halos.<n>` — the immutable build per
  fork release tag.
- `ghcr.io/hatlabs/homarr:latest-halos` — moves with the most recent fork
  release.

The workflow is triggered by pushing a `v*-halos.*` tag, or manually via
`workflow_dispatch` with a tag argument.

## Upstream workflow

The upstream `deployment-docker-image.yml` and `deployment-weekly-release.yml`
workflows are guarded with `if: github.repository == 'homarr-labs/homarr'` so
they no-op on the fork. This keeps the upstream files close to verbatim and
minimizes rebase conflicts when pulling new upstream commits.

## Carried patches

Each fork branch should land via a normal hatlabs internal PR. The eventual
upstream PR (where applicable) is prepared as a separate, narrower branch
rebased onto the upstream merge target (`dev`).
