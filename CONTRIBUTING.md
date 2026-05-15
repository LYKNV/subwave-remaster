# Contributing to SUB/WAVE

Thanks for your interest in SUB/WAVE. It's a small project — contributions,
bug reports, and ideas are all welcome.

## Getting set up

See [`README.md`](README.md) for the architecture and [`DEPLOY.md`](DEPLOY.md)
for deployment. For local development:

```bash
cd docker && docker compose up -d        # Icecast + Liquidsoap + Controller
cd controller && npm install && npm run dev
cd web && npm install && npm run dev     # web UI on :7700
```

There is no test runner, linter, or formatter configured. Match the style of
the surrounding code.

## Reporting bugs

Open an issue with:

- what you expected vs. what happened,
- steps to reproduce,
- relevant logs (`docker compose logs -f controller` / `liquidsoap`).

## Pull requests

- Branch off `main` and keep PRs focused on one change.
- Explain the *why*, not just the *what*, in the description.
- If you touch the queue/playback path, `radio.liq`, the crossfade, ducking, or
  the LLM layer, read the relevant note in `CLAUDE.md` first — those areas have
  non-obvious constraints that are easy to regress.
- Don't commit secrets. `.env` files are gitignored; update the `.env.example`
  files instead when you add config.

## Code of conduct

Be respectful and constructive. Harassment or abuse of any kind isn't welcome
here. Maintainers may remove comments, commits, or contributors that don't
follow this.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE) that covers this project.
