-- Each share's ciphertext length, so the storage-cap check sums a small
-- column from an index instead of reading every ciphertext.
ALTER TABLE shares ADD COLUMN size INTEGER NOT NULL DEFAULT 0;
UPDATE shares SET size = LENGTH(ciphertext);

-- (expires_at, size) covers both the cap check and the daily purge.
DROP INDEX shares_expires_at;
CREATE INDEX shares_expires_at_size ON shares (expires_at, size);
