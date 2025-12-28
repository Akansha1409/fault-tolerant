# Fault-Tolerant Data Processing System

## Overview
This system ingests unreliable JSON data, normalizes it, deduplicates it based on content, and provides aggregated analytics.

## How to Run
1. Navigate to `/backend` and run `node server.js`
2. Navigate to `/frontend` and run `npm run dev`
3. Open the frontend URL.

## Q&A (Assignment Deliverables)

### 1. What assumptions did you make?
* **Identical Payloads are Retries:** Since there is no unique Event ID provided by the client, I assume that if the exact same JSON payload (determined by SHA-256 hash) arrives, it is a retry of a previous request. This implies that two genuinely distinct transactions with identical data occurring at the same time will be treated as one.
* **Client Identification:** I assume the client ID is located in fields named `source`, `client`, or `id`.
* **Currency/Units:** I assume all "amount" fields are in the same currency/unit, as no conversion logic was requested.

### 2. How does your system prevent double counting?
I implemented a **Content-Addressable Hashing** strategy.
1.  Upon receipt, the raw JSON string is hashed using SHA-256.
2.  We check the database `events` table for this hash (`event_hash` column).
3.  If the hash exists, we return a `200 OK` immediately (Idempotent success) and skip processing/writing.
4.  If the hash does not exist, we process and insert it.
5.  The database enforces a `UNIQUE` constraint on the `event_hash` column to handle race conditions where two threads process the same payload simultaneously.

### 3. What happens if the database fails mid-request?
1.  The hash generation and normalization happen *in-memory* first.
2.  If the database write fails (e.g., connection lost), the API returns a `500` error to the client.
3.  **Crucially**, the event hash is **not** saved.
4.  The client is expected to retry the request.
5.  On the retry, since the hash wasn't saved previously, the system treats it as a new attempt and tries the write again. This ensures zero data loss and consistency.

### 4. What would break first at scale?
* **SQLite Locking:** SQLite allows only one writer at a time. High-concurrency writes would result in `SQLITE_BUSY` errors. Solution: Migrate to Postgres/MySQL.
* **Sequential Idempotency Check:** Checking the DB for the hash on every request adds latency. Solution: Use Redis for a fast, TTL-based unique lock for recent event hashes.
* **Normalization Heuristics:** The current "guess the field name" logic is O(N) on payload size and fragile. Solution: Implement a schema registry where clients are assigned specific versioned schemas.
