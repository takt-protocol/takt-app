# Contributing to Takt Protocol (`takt-app`)

Thank you for contributing to Takt Protocol! This repository houses the off-chain components of Takt Protocol: the TypeScript Soroban SDK, the Go keeper execution service, and the React + Vite dashboard.

## Prerequisites

- **Node.js**: `>= 20.0.0`
- **npm**: `>= 10.0.0`
- **Go**: `>= 1.22.0`

## Repository Structure

```
takt-app/
├── apps/
│   └── web/              # React 18 + Vite + Tailwind CSS dashboard
├── packages/
│   └── sdk/              # TypeScript Soroban SDK & contract error decoders
└── services/
    └── keeper/           # Go keeper service & execution polling daemon
```

## Local Development & Setup

1. Clone the repository and install workspace dependencies:
   ```bash
   git clone https://github.com/takt-protocol/takt-app.git
   cd takt-app
   npm install
   ```

2. Build and test the TypeScript SDK:
   ```bash
   npm run build --workspace=@takt-protocol/sdk
   npm run test --workspace=@takt-protocol/sdk
   ```

3. Run the React Web Dashboard:
   ```bash
   npm run dev --workspace=@takt-protocol/web
   ```

4. Build the Go Keeper Daemon:
   ```bash
   cd services/keeper
   go build -o takt-keeper .
   ```

## Development & Git Guidelines

- **Atomic Commits**: Keep commits focused and logically organized following conventional commit conventions (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
- **Git Discipline**: Never use `git add .` or `git add -A`. Stage only files modified for each commit.
- **Testing**: Ensure all SDK unit tests (`npm test`) and Go builds pass before submitting pull requests.
- **Code Quality**: No placeholder comments or unfinished stubs in committed code.
