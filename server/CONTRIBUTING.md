# Contributing to PGAutoPilot

Thank you for your interest in contributing. Please read this guide before opening a PR.

## Before You Start

- **Node.js 18+** is required to build and test.
- **TypeScript strict mode:** no `any` types, no unused variables.
- **Keep dependencies minimal.** Every new dependency must be justified in the PR description.
- **Test your changes.** Run `npm run typecheck` and `npm run lint` before committing.

## Pull Request Guidelines

1. **Fork the repo and create a feature branch** from `main`.
2. **Make focused changes.** One logical change per PR.
3. **Update documentation** if your change affects behavior, CLI flags, or configuration.
4. **Run checks before pushing:**
   ```bash
   npm run typecheck
   npm run lint
   ```
5. **Open the PR with a clear description** of what changed and why. Link any related issues.

## Bundle Artifact

`dist/pgautopilot.bundle.cjs` is a **committed build artifact**. It is the single-file executable that end users run.

- **Do not rebuild or modify `dist/pgautopilot.bundle.cjs` as part of your PR.**
- **Do not include rebuilt bundle output in your commits.**
- The maintainer regenerates and commits the bundle during merge.

If your PR changes any source file under `src/`, mention it in the PR description so the maintainer knows to rebuild the bundle.

## Security Issues

If you discover a security vulnerability, please report it privately via [GitHub Security Advisories](https://github.com/cyberreinxy/pgautopilot/security/advisories). Do not open a public issue until the vulnerability has been patched.

## Code of Conduct

Be respectful and constructive. This is a small community project; treat others as you would like to be treated.
