-- Initial schema. Run with: psql "$DATABASE_URL" -f sql/schema.sql

CREATE TABLE IF NOT EXISTS rank_attempts (
  id                   UUID PRIMARY KEY,
  display_name         TEXT NOT NULL
    CHECK (
      display_name = BTRIM(display_name)
      AND CHAR_LENGTH(display_name) BETWEEN 2 AND 80
    ),
  amount_cents         INTEGER NOT NULL
    CHECK (amount_cents BETWEEN 100 AND 2000000000),
  product_id           TEXT NOT NULL CHECK (product_id <> ''),
  polar_checkout_id    TEXT UNIQUE,
  checkout_expires_at  TIMESTAMPTZ,
  polar_order_id       TEXT UNIQUE,
  order_total_cents    INTEGER,
  order_refundable_cents INTEGER,
  order_refunded_cents INTEGER NOT NULL DEFAULT 0
    CHECK (order_refunded_cents >= 0),
  state                TEXT NOT NULL DEFAULT 'creating'
    CHECK (
      state IN (
        'creating',
        'open',
        'failed',
        'accepted',
        'manual_review',
        'refund_pending',
        'refund_processing',
        'refund_submitted',
        'refunded'
      )
    ),
  polar_refund_id      TEXT UNIQUE,
  refund_attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (refund_attempt_count >= 0),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ranks (
  id            BIGSERIAL PRIMARY KEY,
  attempt_id    UUID NOT NULL UNIQUE REFERENCES rank_attempts(id),
  display_name  TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL CHECK (amount_cents BETWEEN 100 AND 2000000000),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS ranks_active_amount_idx
  ON ranks (amount_cents)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS ranks_board_idx
  ON ranks (amount_cents DESC, created_at DESC)
  WHERE revoked_at IS NULL;
