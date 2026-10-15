-- Password-protected share links. Rows hold ciphertext only: the password,
-- title and document never reach the server (see src/lib/share/crypto.ts).
CREATE TABLE shares (
  id TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,     -- base64 AES-GCM output
  iv TEXT NOT NULL,             -- base64, 12 bytes
  salt TEXT NOT NULL,           -- base64, 16 bytes (PBKDF2)
  iterations INTEGER NOT NULL,
  auth_hash TEXT NOT NULL,      -- hex SHA-256 of the access proof
  created_at INTEGER NOT NULL,  -- ms since the epoch
  expires_at INTEGER NOT NULL   -- ms since the epoch
);

CREATE INDEX shares_expires_at ON shares (expires_at);
