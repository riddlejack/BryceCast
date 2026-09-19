// Emits the real V2 schema without opening any source or production database.
import { DatabaseSync } from 'node:sqlite';
import { createV2Schema } from './lib/archive-v2.mjs';
const db = new DatabaseSync(':memory:');
try {
  createV2Schema(db);
  console.log('-- Generated from scripts/lib/archive-v2.mjs; schema only, no source records.');
  const rows = db.prepare("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type DESC, name").all();
  console.log(rows.map(row => `${row.sql};`).join("\n\n"));
} finally { db.close(); }
