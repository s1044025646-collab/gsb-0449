import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { FORMULA_VERSION } from './config.js';

export interface PoolRow {
  pool_id: string;
  name: string;
  asset_x: string;
  asset_y: string;
  reserve_x: string;
  reserve_y: string;
  fee_num: string;
  version: number;
  seq: number;
  formula_version: string;
  created_at: string;
  source_pool_id: string | null;
  source_seq: number | null;
}

export interface TxRow {
  pool_id: string;
  tx_index: number;
  direction: string;
  amount_in: string;
  amount_out: string;
  q: string;
  numerator: string;
  denominator: string;
  remainder: string;
  fee_num: string;
  product_before: string;
  product_after: string;
  reserve_x_before: string;
  reserve_y_before: string;
  reserve_x_after: string;
  reserve_y_after: string;
  request_id: string;
  created_at: string;
}

export interface RequestRow {
  request_id: string;
  pool_id: string;
  body_hash: string;
  status: string;
  tx_index: number | null;
  response_json: string;
  created_at: string;
}

export function openDatabase(file: string): DatabaseSync {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pools (
      pool_id         TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      asset_x         TEXT NOT NULL,
      asset_y         TEXT NOT NULL,
      reserve_x       TEXT NOT NULL,
      reserve_y       TEXT NOT NULL,
      fee_num         TEXT NOT NULL,
      version         INTEGER NOT NULL,
      seq             INTEGER NOT NULL,
      formula_version TEXT NOT NULL,
      created_at      TEXT NOT NULL,
      source_pool_id  TEXT,
      source_seq      INTEGER
    );

    CREATE TABLE IF NOT EXISTS transactions (
      pool_id          TEXT NOT NULL REFERENCES pools(pool_id),
      tx_index         INTEGER NOT NULL,
      direction        TEXT NOT NULL,
      amount_in        TEXT NOT NULL,
      amount_out       TEXT NOT NULL,
      q                TEXT NOT NULL,
      numerator        TEXT NOT NULL,
      denominator      TEXT NOT NULL,
      remainder        TEXT NOT NULL,
      fee_num          TEXT NOT NULL,
      product_before   TEXT NOT NULL,
      product_after    TEXT NOT NULL,
      reserve_x_before TEXT NOT NULL,
      reserve_y_before TEXT NOT NULL,
      reserve_x_after  TEXT NOT NULL,
      reserve_y_after  TEXT NOT NULL,
      request_id       TEXT NOT NULL,
      created_at       TEXT NOT NULL,
      PRIMARY KEY (pool_id, tx_index)
    );

    CREATE TABLE IF NOT EXISTS requests (
      request_id    TEXT PRIMARY KEY,
      pool_id       TEXT NOT NULL,
      body_hash     TEXT NOT NULL,
      status        TEXT NOT NULL,
      tx_index      INTEGER,
      response_json TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_requests_pool ON requests(pool_id);
  `);
  const row = db.prepare("SELECT value FROM meta WHERE key = 'formula_version'").get() as { value: string } | undefined;
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  db.prepare('INSERT OR IGNORE INTO meta(key, value) VALUES (?, ?)').run('formula_version', FORMULA_VERSION);
  if (row && row.value !== FORMULA_VERSION) {
    throw new Error(`数据库公式版本 ${row.value} 与当前程序 ${FORMULA_VERSION} 不兼容`);
  }
}

/** 进程内串行化所有写事务；配合 BEGIN IMMEDIATE 保证并发至多一笔成交。 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  async run<T>(fn: () => T): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      return fn();
    } finally {
      release();
    }
  }
}
