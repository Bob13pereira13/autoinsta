-- The read-only API (v1) and the MCP server were removed, and with them the
-- workspace service keys that authenticated them. The table only held key
-- names, token hashes, scopes and dates; nothing else references it.
-- IF EXISTS keeps this safe on databases where the table was never created.

-- DropForeignKey
ALTER TABLE IF EXISTS "ServiceKey" DROP CONSTRAINT IF EXISTS "ServiceKey_workspaceId_fkey";

-- DropTable
DROP TABLE IF EXISTS "ServiceKey";
