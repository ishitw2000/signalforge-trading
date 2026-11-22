# SignalForge — Groww F&O strategy workspace

A local-first starter for building indicator-driven futures and options strategies with a React dashboard and FastAPI service. The Groww request/response reference is in [`docs/groww-api-contract.md`](docs/groww-api-contract.md).

## Run locally

1. Backend: `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && uvicorn app.main:app --reload`
2. Frontend (another terminal): `cd frontend && npm install && npm run dev`
3. Open the Vite URL (usually `http://localhost:5173`).

By default, the app uses sample market data and paper mode. To enable authenticated Groww reads, set `GROWW_ACCESS_TOKEN` in `backend/.env` (copy `.env.example`). Live order placement is additionally gated by `TRADING_MODE=live` and a per-request `confirm_live=true`; do not expose this backend to the public internet.

## Current scope

- Strategy builder with an explainable price action pullback evaluator (momentum, Fibonacci retracement, candle body/wicks, swing levels, and mean reversion) for F&O workflows.
- API endpoints to evaluate completed Groww candles, inspect status, query Groww market data, and submit orders.
- Paper execution is the default. This scaffold does not promise profitable signals, implement a backtester, stream exchange data, or persist strategy state across restarts.
- Price action rules and their thresholds are documented in [`docs/price-action-strategy.md`](docs/price-action-strategy.md). A signal is informational and never places an order.
- Add your own authentication, durable database, risk limits, deployment controls, and compliance review before production use.

Groww API access requires an active Groww Trading API subscription and an authorized user account. This project integrates documented Groww REST APIs; Groww SDK behavior and published contract can change.
