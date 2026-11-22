# Price Action Pullback Strategy

This implements an explainable **candidate-signal** rule set from the supplied notes. It analyzes completed OHLCV candles for an underlying (default Groww symbol such as `NSE-NIFTY`) and does not place orders. A `LONG` or `SHORT` result is a rule match, not a recommendation or a claim of profitability.

## Entry checks

The evaluator measures the latest close against the close at the start of the configured swing lookback and expresses the move in ATR units. It identifies a recent impulse swing, then measures the close's pullback from that swing using Fibonacci retracement. The default rule settings are:

- 20 completed candles for the swing window
- 0.8 ATR minimum directional move
- 38.2%–61.8% retracement zone
- 55% minimum candle body-to-range ratio
- Strong candle confirmation requires direction to agree with the impulse, an opposing wick no larger than 20% of the candle, plus a rejection wick or close through the previous candle's high/low
- Prior local support/resistance is considered nearby within 0.35 ATR
- Price returning to the recent mean on the trend side within 1 ATR adds confluence

Momentum, Fibonacci pullback, and candle confirmation are required. At least one of support/resistance proximity and mean reversion alignment must also pass. This produces a candidate LONG or SHORT. If any core check fails, the output is NEUTRAL. The response also lists each rule, details, Fibonacci levels, nearby structure, data symbol, and confidence score (passing checks divided by five). Confidence is a rule-match score, not a win probability.

## API use

`GET /api/strategies/{id}/signal` fetches Groww candles and evaluates the stored `Price Action` condition. It maps the selected timeframe to Groww's historical-candles interval and discards any candle that has not closed. By default, the underlying index/equity candle series is used with `segment=CASH`, for example `NSE-NIFTY`. To evaluate a specific F&O contract, pass `groww_symbol` and `groww_segment=FNO` query parameters.

Groww historical candle contract: `GET /v1/historical/candles` with `exchange`, `segment`, `groww_symbol`, `start_time`, `end_time`, and `candle_interval`; each candle row contains timestamp, open, high, low, close, volume, and (for F&O) optional open interest. See [Groww's official Backtesting documentation](https://groww.in/trade-api/docs/curl/backtesting) for the current contract and data limits.

## Limits

This first implementation is a bar-based pullback evaluator. It does not model order fills, slippage, expiry/strike selection, options Greeks, position sizing, or risk exits. The configured strategy's `kind` does not automatically select an option contract. Signals require an authorized Groww API token. Without one, the endpoint reports `WAITING_FOR_MARKET_DATA`; it never substitutes sample candles.
