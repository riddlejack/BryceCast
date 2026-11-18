import { statSync } from 'node:fs';

/** Size and modification time of a SQLite archive and its WAL. A write in
 * either journal mode changes it (in WAL mode a write can leave the main file
 * as it was), so a summary kept under it is answered again only after the
 * archive changes. An empty WAL holds no pages, so it reads as no WAL: the
 * first read-only open of a WAL archive creates one, and that is not a write. */
export const archiveSignatureOf = (sqlitePath) => {
  const part = (path, emptyIsAbsent = false) => {
    try {
      const info = statSync(path);
      if (emptyIsAbsent && info.size === 0) return '-';
      return `${info.size}:${info.mtimeMs}`;
    } catch {
      return '-';
    }
  };
  return `${part(sqlitePath)}|${part(`${sqlitePath}-wal`, true)}`;
};
