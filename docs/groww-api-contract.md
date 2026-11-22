# Groww Trading API contract (F&O focused)

**Source of truth:** [Groww cURL API documentation](https://groww.in/trade-api/docs/curl), checked 22 Nov 2026. This is a local integration map of Groww's published REST contract, not a substitute for the live docs. Groww currently documents API trading for `CASH` and `FNO`; MCX commodity trading is unavailable through the API. All prices are INR unless noted.

## Shared request and response rules

- API host: `https://api.groww.in/v1`.
- Authenticated calls use `Authorization: Bearer {ACCESS_TOKEN}`, `Accept: application/json`, and `X-API-VERSION: 1.0`. JSON requests also use `Content-Type: application/json`.
- Successful responses are JSON `{ "status": "SUCCESS", "payload": ... }`. Failures are `{ "status": "FAILURE", "error": { "code": "GA001", "message": "...", "metadata": null } }`. Documented codes include GA000, GA001, GA003–GA007.
- Rate limits are grouped by API type: auth 5/sec and 30/min (also 150 token calls/day); orders 10/sec and 250/min; live data 10/sec and 300/min; non-trading 20/sec and 500/min.
- A Groww access token expires daily at 06:00 (Groww docs). API key and secret auth requires daily approval. Keep credentials server-side.

## Authentication

`POST /token/api/access` with `Authorization: Bearer {USER_API_KEY}`. Approval body: `{ "key_type": "approval", "checksum": "<sha256(secret + timestamp)>", "timestamp": "<epoch seconds>" }`. TOTP body: `{ "key_type": "totp", "totp": "<six-digit code>" }`. The documented approval response includes `token`, `tokenRefId`, `sessionName`, `expiry`, and `isActive`.

## Instruments

`GET https://growwapi-assets.groww.in/instruments/instrument.csv` (public CSV). Fields include exchange, exchange_token, trading_symbol, groww_symbol, name, instrument_type, segment, series, isin, underlying_symbol, underlying_exchange_token, expiry_date, strike_price, lot_size, tick_size, freeze_quantity, is_reserved, buy_allowed, sell_allowed. Use `FNO` symbols and lot sizes from this file to select derivatives.

## Order APIs

Reference: [Orders docs](https://groww.in/trade-api/docs/curl/orders).

| Method and path | Request | Success payload |
|---|---|---|
| `POST /order/create` | `{trading_symbol, quantity, price?, trigger_price?, validity, exchange, segment, product, order_type, transaction_type, order_reference_id?}`. Symbol/quantity/validity/exchange/segment/product/order_type/transaction_type required. | `{groww_order_id, order_status, order_reference_id?, remark}` |
| `POST /order/modify` | `{quantity?, price?, trigger_price?, order_type?, segment, groww_order_id}` | status and order result per docs |
| `POST /order/cancel` | `{segment, groww_order_id}` | status and cancellation result |
| `GET /order/detail/{groww_order_id}?segment=FNO` | Path ID and segment query | Detailed order object including symbol, status, quantity, prices, filled/remaining quantities, validity, exchange, order type, transaction type, segment, product, timestamps, and reference ID |
| `GET /order/status/{groww_order_id}?segment=FNO` | Path ID and segment query | Current order status |
| `GET /order/status/reference/{order_reference_id}?segment=FNO` | Reference ID and segment query | Current order status |
| `GET /order/list?segment=FNO&page=0&page_size=100` | Optional segment, page, page_size (max 100) | `{order_list:[...]}` with order status, symbol, quantity, prices, fills, validity, exchange, type, product, timestamps and reference ID |
| `GET /order/trades/{groww_order_id}?segment=FNO` | Path ID and segment query | Trades for order |

The list/status/trades paths and optional query parameters can change; consult the linked live page before adding calls. Create order sample response: `{ "status":"SUCCESS", "payload": {"groww_order_id":"...", "order_status":"OPEN", "order_reference_id":"...", "remark":"Order placed successfully"} }`.

### Smart orders

Reference: [Smart Orders docs](https://groww.in/trade-api/docs/curl/smart-orders). Smart orders support `CASH` and `FNO`; API GTT defaults to one-year validity.

| Method and path | Contract summary |
|---|---|
| `POST /order-advance/create` | GTT body includes `reference_id`, `smart_order_type:"GTT"`, `segment`, `trading_symbol`, `quantity`, `trigger_price`, `trigger_direction`, nested `order:{order_type,price?,transaction_type}`, `product_type`, `exchange`, `duration`; optional child legs. |
| `PUT /order-advance/modify/{smart_order_id}` | Type-specific body: GTT supports quantity/trigger/direction/order fields; OCO supports quantity/duration/product/target and stop triggers. |
| `POST /order-advance/cancel/{segment}/{smart_order_type}/{smart_order_id}` | Cancel active GTT or OCO. |
| `GET /order-advance/detail/...` | Fetch a smart order; see linked page for complete path and response. |
| `GET /order-advance/list` | List smart orders; see linked page for filters and response. |

Check the Smart Orders page for exact optional fields and response objects before implementing. GTT/OCO execution is broker-side after creation.

## Live data

Reference: [Live Data docs](https://groww.in/trade-api/docs/curl/live-data). Segment is `FNO` for derivatives. Up to 50 instruments per LTP/OHLC call.

| Method and path | Required request | Response payload summary |
|---|---|---|
| `GET /live-data/quote?exchange=NSE&segment=FNO&trading_symbol=...` | exchange, segment, trading_symbol | Snapshot: last price, day change, OHLC, bid/offer, depth, volume, open interest and related fields |
| `GET /live-data/ltp?segment=FNO&exchange_symbols=NSE_SYMBOL,...` | segment, exchange-symbol array | Latest-price map |
| `GET /live-data/ohlc?segment=FNO&exchange_symbols=NSE_SYMBOL,...` | segment, exchange-symbol array | Current OHLC snapshot (not interval candles) |
| `GET /option-chain/exchange/{exchange}/underlying/{underlying}?expiry_date=YYYY-MM-DD` | exchange, underlying, expiry_date | `{underlying_ltp, strikes}`; each strike may include CE/PE with `trading_symbol`, `ltp`, `open_interest`, `volume`, and `greeks:{delta,gamma,theta,vega,rho,iv}` |
| `GET /live-data/greeks/exchange/{exchange}/underlying/{underlying}/trading_symbol/{trading_symbol}/expiry/{expiry}` | Exchange, underlying, contract symbol, expiry (`YYYY-MM-DD`) | `{greeks:{delta,gamma,theta,vega,rho,iv}}` |

The option-chain path above is used by this backend. Quote, LTP and OHLC examples are in the docs. The live documentation is authoritative for parameter requirements.

## Historical data

Reference: [Historical Data docs](https://groww.in/trade-api/docs/curl/historical-data). Groww marks `GET /historical/candle/range` deprecated and directs clients to **Get Historical Candle Data**. The legacy endpoint accepts `exchange`, `segment`, `trading_symbol`, `start_time`, `end_time`, optional `interval_in_minutes`. Response payload has `candles` as arrays `[epoch_seconds, open, high, low, close, volume]`, plus range and interval. Documented availability/range limits vary by interval; use the current candle endpoint before implementation.

## Portfolio and margin

References: [Portfolio docs](https://groww.in/trade-api/docs/curl/portfolio), [Margin docs](https://groww.in/trade-api/docs/curl/margin).

| Method and path | Request | Response |
|---|---|---|
| `GET /holdings/user` | None | `{holdings:[{isin,trading_symbol,quantity,average_price,...locked/pledged/T1 quantities}]}` |
| `GET /positions/user?segment=FNO` | Optional segment (`CASH`/`FNO`) | User positions including symbol, quantities, prices, exchange, product and realized P&L |
| `GET /positions/trading-symbol?trading_symbol=...&segment=FNO` | Symbol and segment | Position detail for one instrument |
| `GET /margins/detail/user` | None | Cash, used/available margin and nested `fno_margin_details` and `equity_margin_details` |
| `POST /margins/detail/orders?segment=FNO` | JSON array of `{trading_symbol,transaction_type,quantity,price?,order_type,product,exchange}` | Required exposure/span, option premium, charges, total requirement, cash margin and physical-delivery requirement |

## User

Reference: [User docs](https://groww.in/trade-api/docs/curl/user). `GET /user/detail` returns `{vendor_user_id, ucc, nse_enabled, bse_enabled, ddpi_enabled, active_segments}` in `payload`.

## Integration status in this starter

Implemented authenticated backend adapters: user profile, quote, option chain, positions, available margin, and order create. The remaining documented resources are catalogued above for implementation. The frontend defaults to paper mode. To place a real order, the server must be explicitly configured with `TRADING_MODE=live`, a Groww token, and the request must include `confirm_live:true`.
