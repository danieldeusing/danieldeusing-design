# Contributing

Thanks for wanting to improve the design system. Bug reports and pull requests
are welcome.

## Reporting

Open an issue with the version you use (the `@x.y.z` in your jsDelivr URL or
`package.json`), the browser, the theme (`html[data-theme]`) and a screenshot or a
minimal HTML file that shows the problem.

## Changing the code

`main` cannot be force-pushed or deleted. A push to `main` with a new version in
`package.json` publishes that version to npm, so **leave the version alone**: the
maintainer bumps it when releasing.

1. Fork the repository and create a branch.
2. Make the change in `src/` (or `runtime/`, `tokens/`). Keep it small and focused
   on one thing.
3. Rebuild and check (no dependencies, Node 18+):

   ```bash
   npm run build
   npm run check:release
   ```

   `dist/` and `tokens/tokens.json` are committed, so include the rebuilt files.
4. Check the change in a browser in all four themes; the `examples/` pages help.
5. Open the pull request and describe what changed and why, with a screenshot for
   anything visible.

By contributing you agree that your work is published under the
[MIT License](LICENSE).
