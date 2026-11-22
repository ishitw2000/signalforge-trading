from __future__ import annotations

import os
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional, Union
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()
GROWW_BASE = "https://api.groww.in/v1"
app = FastAPI(title="SignalForge API", version="0.1.0", description="Indicator strategy workspace with Groww F&O API integration")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["*"], allow_headers=["*"])

strategies: list[dict[str, Any]] = [
    {"id": "strat-demo", "name": "NIFTY price action pullback", "instrument": "NIFTY", "segment": "FNO", "kind": "Options", "timeframe": "5m", "enabled": False, "conditions": [{"indicator": "Price Action", "parameters": {"swing_lookback": 20, "body_min_ratio": 0.55, "fib_min": 0.382, "fib_max": 0.618, "momentum_atr": 0.8}, "operator": "confluence"}], "updated_at": datetime.now(timezone.utc).isoformat()},
]
paper_orders: list[dict[str, Any]] = []


class Condition(BaseModel):
    indicator: Literal["Price Action", "RSI", "EMA crossover", "MACD", "Supertrend", "Volume"]
    parameters: dict[str, Union[float, int]] = Field(default_factory=dict)
    operator: str
    value: Optional[float] = None


class StrategyIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    instrument: str = Field(min_length=1, max_length=40)
    segment: Literal["CASH", "FNO"] = "FNO"
    kind: Literal["Futures", "Options", "Equity"] = "Options"
    timeframe: Literal["1m", "5m", "15m", "1h", "1d"] = "5m"
    conditions: list[Condition] = Field(min_length=1)


class OrderIn(BaseModel):
    trading_symbol: str
    quantity: int = Field(gt=0)
    transaction_type: Literal["BUY", "SELL"]
    order_type: Literal["MARKET", "LIMIT", "SL", "SL_M"] = "MARKET"
    product: str = "MIS"
    price: float = 0
    trigger_price: float = 0
    validity: str = "DAY"
    exchange: Literal["NSE", "BSE"] = "NSE"
    segment: Literal["CASH", "FNO"] = "FNO"
    order_reference_id: Optional[str] = None
    confirm_live: bool = False


def groww_headers() -> dict[str, str]:
    token = os.getenv("GROWW_ACCESS_TOKEN", "").strip()
    if not token:
        raise HTTPException(503, "Groww access token is not configured. Add GROWW_ACCESS_TOKEN to backend/.env.")
    return {"Authorization": f"Bearer {token}", "Accept": "application/json", "X-API-VERSION": "1.0", "Content-Type": "application/json"}


async def groww(method: str, path: str, *, params: Optional[dict] = None, body: Optional[dict] = None):
    async with httpx.AsyncClient(timeout=12) as client:
        try:
            response = await client.request(method, f"{GROWW_BASE}{path}", headers=groww_headers(), params=params, json=body)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            try:
                detail = exc.response.json()
            except Exception:
                detail = exc.response.text[:500]
            raise HTTPException(exc.response.status_code, detail) from exc
        except httpx.RequestError as exc:
            raise HTTPException(502, f"Groww API connection failed: {exc}") from exc


@app.get("/api/health")
def health():
    mode = os.getenv("TRADING_MODE", "paper").lower()
    return {"ok": True, "service": "SignalForge API", "mode": mode if mode in ("paper", "live") else "paper", "groww_configured": bool(os.getenv("GROWW_ACCESS_TOKEN", "").strip()), "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/strategies")
def list_strategies():
    return strategies


@app.post("/api/strategies")
def create_strategy(strategy: StrategyIn):
    item = strategy.model_dump()
    item.update(id=f"strat-{uuid4().hex[:8]}", enabled=False, updated_at=datetime.now(timezone.utc).isoformat())
    strategies.insert(0, item)
    return item


@app.patch("/api/strategies/{strategy_id}/toggle")
def toggle_strategy(strategy_id: str):
    item = next((s for s in strategies if s["id"] == strategy_id), None)
    if not item:
        raise HTTPException(404, "Strategy not found")
    item["enabled"] = not item["enabled"]
    return item


def _true_ranges(candles: list[dict[str, float]]) -> list[float]:
    values = []
    for index, candle in enumerate(candles):
        prior = candles[index - 1]["close"] if index else candle["close"]
        values.append(max(candle["high"] - candle["low"], abs(candle["high"] - prior), abs(candle["low"] - prior)))
    return values


def evaluate_price_action(candles: list[list[Any]], parameters: dict[str, Any]) -> dict[str, Any]:
    """Evaluate completed Groww OHLCV candles and return an explainable, non-executing signal."""
    rows = []
    for row in candles:
        if not isinstance(row, (list, tuple)) or len(row) < 6:
            continue
        try:
            candle = {"open": float(row[1]), "high": float(row[2]), "low": float(row[3]), "close": float(row[4]), "volume": float(row[5])}
        except (TypeError, ValueError):
            continue
        if all(math.isfinite(value) for value in candle.values()) and candle["high"] >= candle["low"]:
            rows.append(candle)

    lookback = max(8, min(int(parameters.get("swing_lookback", 20)), 80))
    if len(rows) < lookback + 2:
        return {"status": "INSUFFICIENT_DATA", "signal": "NEUTRAL", "candles_used": len(rows), "required": lookback + 2, "message": f"Need at least {lookback + 2} completed candles for swing and pullback analysis."}

    body_min_ratio = max(0.25, min(float(parameters.get("body_min_ratio", 0.55)), 0.9))
    fib_min = max(0.1, min(float(parameters.get("fib_min", 0.382)), 0.8))
    fib_max = max(fib_min + 0.01, min(float(parameters.get("fib_max", 0.618)), 0.9))
    momentum_atr = max(0.1, min(float(parameters.get("momentum_atr", 0.8)), 4.0))
    current, previous = rows[-1], rows[-2]
    history = rows[-lookback - 1:-1]
    ranges = _true_ranges(rows[-15:])
    atr = sum(ranges) / len(ranges)
    if atr <= 0:
        return {"status": "INVALID_DATA", "signal": "NEUTRAL", "message": "Candle range is zero; cannot calculate price action."}

    move = current["close"] - history[0]["close"]
    direction = "LONG" if move > 0 else "SHORT" if move < 0 else "NEUTRAL"
    side = 1 if direction == "LONG" else -1
    move_atr = abs(move) / atr

    # Use the dominant recent swing as the impulse leg; measure price's pullback from it.
    if direction == "LONG":
        low_index = min(range(len(history)), key=lambda i: history[i]["low"])
        swing_low = history[low_index]["low"]
        swing_high = max(item["high"] for item in history[low_index:])
        swing_range = swing_high - swing_low
        retracement = (swing_high - current["close"]) / swing_range if swing_range > 0 else 1.0
        fib_382, fib_618 = swing_high - swing_range * 0.382, swing_high - swing_range * 0.618
    elif direction == "SHORT":
        high_index = max(range(len(history)), key=lambda i: history[i]["high"])
        swing_high = history[high_index]["high"]
        swing_low = min(item["low"] for item in history[high_index:])
        swing_range = swing_high - swing_low
        retracement = (current["close"] - swing_low) / swing_range if swing_range > 0 else 1.0
        fib_382, fib_618 = swing_low + swing_range * 0.382, swing_low + swing_range * 0.618
    else:
        swing_low, swing_high, retracement, fib_382, fib_618 = 0, 0, 1.0, 0, 0

    candle_range = max(current["high"] - current["low"], 1e-9)
    body_ratio = abs(current["close"] - current["open"]) / candle_range
    lower_wick = min(current["open"], current["close"]) - current["low"]
    upper_wick = current["high"] - max(current["open"], current["close"])
    candle_side = 1 if current["close"] > current["open"] else -1 if current["close"] < current["open"] else 0
    rejection_wick = lower_wick if side > 0 else upper_wick
    opposing_wick = upper_wick if side > 0 else lower_wick

    swings = rows[-lookback - 1:-1]
    supports = [c["low"] for i, c in enumerate(swings[1:-1], 1) if c["low"] <= swings[i - 1]["low"] and c["low"] <= swings[i + 1]["low"]]
    resistances = [c["high"] for i, c in enumerate(swings[1:-1], 1) if c["high"] >= swings[i - 1]["high"] and c["high"] >= swings[i + 1]["high"]]
    candidates = supports if side > 0 else resistances
    test_price = current["low"] if side > 0 else current["high"]
    nearby_level = min(candidates, key=lambda level: abs(level - test_price)) if candidates else None
    level_near = nearby_level is not None and abs(nearby_level - test_price) <= atr * 0.35

    momentum_ok = direction != "NEUTRAL" and move_atr >= momentum_atr
    pullback_ok = direction != "NEUTRAL" and fib_min <= retracement <= fib_max
    reclaim = current["close"] > previous["high"] if side > 0 else current["close"] < previous["low"]
    candle_rejection = candle_side == side and body_ratio >= body_min_ratio and opposing_wick / candle_range <= 0.2 and (rejection_wick / candle_range >= 0.08 or reclaim)
    confirmation_ok = candle_rejection or (reclaim and candle_side == side and body_ratio >= body_min_ratio * 0.75 and opposing_wick / candle_range <= 0.2)
    mean_price = sum(c["close"] for c in history) / len(history)
    mean_aligned = abs(current["close"] - mean_price) <= atr * 1.0 and (current["close"] >= mean_price if side > 0 else current["close"] <= mean_price)
    score = sum((momentum_ok, pullback_ok, confirmation_ok, level_near, mean_aligned))
    signal = direction if momentum_ok and pullback_ok and confirmation_ok and score >= 3 else "NEUTRAL"

    rules = [
        {"rule": "Directional momentum", "passed": momentum_ok, "detail": f"{move_atr:.2f} ATR over {lookback} candles; minimum {momentum_atr:.2f} ATR."},
        {"rule": "Measured Fibonacci pullback", "passed": pullback_ok, "detail": f"{retracement * 100:.1f}% retracement; preferred zone {fib_min * 100:.1f}–{fib_max * 100:.1f}%."},
        {"rule": "Candle body and rejection", "passed": confirmation_ok, "detail": f"{body_ratio * 100:.0f}% body; {'previous candle extreme reclaimed' if reclaim else 'wick rejection ' + ('confirmed' if candle_rejection else 'not confirmed')}."},
        {"rule": "Nearby swing level", "passed": level_near, "detail": f"{'Support' if side > 0 else 'Resistance'} {'near ' + format(nearby_level, '.2f') if nearby_level is not None else 'not found'}; within 0.35 ATR."},
        {"rule": "Pullback near the mean", "passed": mean_aligned, "detail": f"Recent mean close {mean_price:.2f}; price must return within 1 ATR on the bias side."},
    ]
    return {
        "status": "EVALUATED", "signal": signal, "bias": direction,
        "setup": "FIBONACCI_PULLBACK" if pullback_ok else "NO_QUALIFIED_PULLBACK",
        "confidence_score": round(score / 5 * 100), "candles_used": len(rows), "last_close": current["close"], "atr": round(atr, 4), "mean_price": round(mean_price, 4),
        "swing": {"low": round(swing_low, 4), "high": round(swing_high, 4), "retracement_ratio": round(retracement, 4), "fib_38_2": round(fib_382, 4), "fib_61_8": round(fib_618, 4)},
        "nearby_level": round(nearby_level, 4) if nearby_level is not None else None,
        "rules": rules,
        "message": f"{signal} setup meets the configured price-action rules." if signal != "NEUTRAL" else "No entry: price-action confluence is incomplete.",
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/strategies/{strategy_id}/signal")
async def preview_signal(strategy_id: str, exchange: str = "NSE", groww_symbol: Optional[str] = None, groww_segment: Literal["CASH", "FNO"] = "CASH"):
    item = next((s for s in strategies if s["id"] == strategy_id), None)
    if not item:
        raise HTTPException(404, "Strategy not found")
    price_action = next((c for c in item.get("conditions", []) if c.get("indicator") == "Price Action"), None)
    unsupported = [c.get("indicator") for c in item.get("conditions", []) if c.get("indicator") != "Price Action"]
    if not price_action:
        return {"strategy_id": strategy_id, "status": "RULES_NOT_IMPLEMENTED", "signal": "NEUTRAL", "message": "Add the Price Action condition to evaluate this strategy."}
    if unsupported:
        return {"strategy_id": strategy_id, "status": "PARTIAL_RULES", "signal": "NEUTRAL", "unsupported_rules": unsupported, "message": "Signal withheld until every selected rule is implemented."}

    timeframe = item.get("timeframe", "5m")
    intervals = {"1m": "1minute", "5m": "5minute", "15m": "15minute", "1h": "1hour", "1d": "1day"}
    if timeframe not in intervals:
        raise HTTPException(400, "Unsupported strategy timeframe")
    local_now = datetime.now(ZoneInfo("Asia/Kolkata"))
    days = {"1m": 2, "5m": 5, "15m": 12, "1h": 60, "1d": 90}[timeframe]
    data_symbol = groww_symbol or f"{exchange}-{item['instrument']}"
    data_segment = groww_segment
    params = {
        "exchange": exchange, "segment": data_segment, "groww_symbol": data_symbol,
        "start_time": (local_now - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S"),
        "end_time": local_now.strftime("%Y-%m-%d %H:%M:%S"), "candle_interval": intervals[timeframe],
    }
    try:
        response = await groww("GET", "/historical/candles", params=params)
    except HTTPException as exc:
        if exc.status_code == 503:
            return {"strategy_id": strategy_id, "status": "WAITING_FOR_MARKET_DATA", "signal": "NEUTRAL", "message": "Configure a Groww API token to evaluate completed candles.", "evaluated_at": datetime.now(timezone.utc).isoformat()}
        raise

    interval_minutes = {"1m": 1, "5m": 5, "15m": 15, "1h": 60, "1d": 1440}[timeframe]
    completed = []
    for candle in response.get("payload", {}).get("candles", []):
        try:
            stamp = datetime.fromisoformat(str(candle[0]).replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=ZoneInfo("Asia/Kolkata"))
            if stamp + timedelta(minutes=interval_minutes) <= local_now:
                completed.append(candle)
        except (TypeError, ValueError, IndexError):
            continue
    result = evaluate_price_action(completed, price_action.get("parameters", {}))
    result.update(strategy_id=strategy_id, data_symbol=data_symbol, data_segment=data_segment)
    return result


@app.get("/api/groww/profile")
async def profile():
    return await groww("GET", "/user/detail")


@app.get("/api/groww/quote")
async def quote(exchange: str = "NSE", segment: str = "FNO", trading_symbol: str = "NIFTY"):
    return await groww("GET", "/live-data/quote", params={"exchange": exchange, "segment": segment, "trading_symbol": trading_symbol})


@app.get("/api/groww/option-chain")
async def option_chain(exchange: str = "NSE", underlying: str = "NIFTY", expiry: Optional[str] = None):
    params = {}
    if expiry:
        params["expiry_date"] = expiry
    return await groww("GET", f"/option-chain/exchange/{exchange}/underlying/{underlying}", params=params)


@app.get("/api/groww/positions")
async def positions(segment: str = "FNO"):
    return await groww("GET", "/positions/user", params={"segment": segment})


@app.get("/api/groww/margin")
async def margin():
    return await groww("GET", "/margins/detail/user")


@app.post("/api/orders")
async def place_order(order: OrderIn):
    mode = os.getenv("TRADING_MODE", "paper").lower()
    payload = order.model_dump(exclude={"confirm_live"})
    if mode != "live":
        record = {"id": f"paper-{uuid4().hex[:8]}", "status": "PAPER_ACCEPTED", "mode": "paper", "order": payload, "created_at": datetime.now(timezone.utc).isoformat()}
        paper_orders.insert(0, record)
        return record
    if not order.confirm_live:
        raise HTTPException(400, "Live orders require confirm_live=true in the request.")
    return await groww("POST", "/order/create", body=payload)


@app.get("/api/orders/paper")
def list_paper_orders():
    return paper_orders[:50]
