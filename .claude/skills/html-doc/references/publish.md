# Publishing a doc to docs.danieldeusing.de

Reference for the `html-doc` skill. Read it once the user has agreed to publish and has chosen
the surface (`site-internal/` or `site/`, step 8 of `SKILL.md`).

## 1. Where in the tree

Within the chosen tree the path is `<context>/<project>/`, mirroring how the estate is
organised — e.g. `poi/vu3/`, `danieldeusing/automation/`. Offer the existing folders
(`ls ~/Work/danieldeusing/danieldeusing-docs/{site,site-internal}/`) plus a new one. The
filename is the kebab-case slug, `.html`.

## 2. Move it in

Use `git mv` if it is already tracked, otherwise `mv` — the file lives in the docs repo, not
next to the subject, so there is exactly one copy:

```bash
DOCS=~/Work/danieldeusing/danieldeusing-docs
TREE=site            # or site-internal
mkdir -p "$DOCS/$TREE/<context>/<project>"
mv <written-file> "$DOCS/$TREE/<context>/<project>/<slug>.html"
```

## 3. Check the folder is reachable, and record it in 1Password

> **Access is per-folder scopes in `danieldeusing-docs/docs-access.json`**, enforced by
> `deploy/docs/server.py` — the single site-wide password is gone. A scope is a folder, the
> users who may open it, and the `surface` it applies to (`public` / `internal` / `both`). It
> **fails closed**: a folder no scope covers cannot be opened by anyone, so a doc published
> into a brand-new folder is unreachable until a scope covers it. The root scope (`""`) is the
> master key and covers everything beneath it, which is why most publishes need no change —
> but check rather than assume, and say so in the report if a new scope is needed.
> Adding or editing a scope is a repo edit in `docs-access.json`, reviewed like any other.

Then record it so the doc can be handed to someone: vault `danieldeusing-agents`, item
`docs - <context>/<project>/<slug>`, category LOGIN, with the **URL** and a note naming the
scope that opens it. Do not invent a password — reference the credential the scope actually
lists.

## 4. Pull before you push

Other machines publish to this repo too, so a blind push fails on a non-fast-forward:

```bash
cd "$DOCS" && git pull --rebase && git add "$TREE/<context>/<project>/<slug>.html" \
  && git commit -m "docs: <what>" && git push
```

Stage the **explicit path**, never `git add -A` or `git add site/`: other machines and agents
publish into this repo concurrently, and a catch-all sweeps their in-progress work into your
commit.

The push is the deploy: GitHub fires a push webhook, `dd-infra-docs` on ddMini verifies the
HMAC and re-syncs. Live in a few seconds — no build, no deploy step.
