# Contributing to Sourced

For changes to Sourced itself, read the [contributor rules](docs/contributing/AGENTS.md) first. The [PRD](docs/PRD.md), [TRD](docs/TRD.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md) and [owner decisions](docs/OWNER-DECISIONS.md) define the requirements and task order.

Use the [commands table](docs/contributing/AGENTS.md#3-commands) for setup and development. Run checks from the repository root:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm check-skills
pnpm db:up
pnpm test:integration
pnpm test:coverage
pnpm db:seed
pnpm build
pnpm test:e2e
```

Integration and coverage checks require the local test database; E2E requires the seeded database and production build. Tests use the mock provider. See the [testing rules](docs/contributing/AGENTS.md#5-testing-rules) for test isolation, coverage and when live evaluation is required; live evaluation costs money.

Before submitting, run `pnpm format` and follow the [commit and pull request rules](docs/contributing/AGENTS.md#6-commits-and-pull-requests), including the [authorship requirements](docs/contributing/AGENTS.md#authorship).
