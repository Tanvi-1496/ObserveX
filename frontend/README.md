# ObserveX

ObserveX is a unified observability console for metrics, logs, traces, alerts, incidents, and synthetic load testing. It is a React 18 + Vite + TypeScript demo with deterministic frontend data and no backend dependency.

## Run locally

```bash
npm install
npm run dev
```

The Vite terminal output shows the local URL. Build the production bundle with `npm run build`.

## Routes

- `/` — service overview and health
- `/metrics` — PromQL-style Metrics Explorer
- `/logs` — searchable Logs Explorer with URL-persistent filters
- `/traces` and `/traces/:id` — trace search and waterfall detail
- `/alerts` — active alerts, history, rules, and channels
- `/incidents` and `/incidents/:id` — incident list and correlated investigation
- `/loadtest` — synthetic traffic and chaos controls
- `/health` — observability stack health
- `/settings` — workspace and integration settings

## Project structure

```text
src/
  components/  Shared UI, layout, async loading, and charts
  data/        Deterministic mock signal generators
  lib/api.ts   Async data-access boundary
  pages/       Route components
  store/       Zustand global state
  types/       Shared TypeScript models
  routes.tsx   React Router data-mode routes
```

## Connect real observability backends

Pages never import mock data directly. Replace only the implementations in `src/lib/api.ts`:

1. `getTimeseries` / `getKpis`: call Prometheus `/api/v1/query_range` and normalize matrix values into `MetricPoint`.
2. `searchLogs`: call Loki `/loki/api/v1/query_range` and normalize stream entries into `LogEntry`.
3. `searchTraces` / `getTrace`: call Jaeger `/api/traces` and map trace/span responses to the shared `Trace` and `Span` interfaces.

Keep credentials on a server-side proxy in production; do not expose private API tokens in Vite environment variables.
