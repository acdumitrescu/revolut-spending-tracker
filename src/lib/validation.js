// One data contract shared by the browser and private API.
export * from '../../backend/appStateSchema.js';
import { sanitizePersistedAppState as sanitizeCurrentAppState } from '../../backend/appStateSchema.js';
import { migrateState } from './migrations.js';

// The one place the client reads a stored workspace (localStorage, server snapshot, backup):
// upgrade it to the current schema version, then repair it. This local export shadows the
// re-exported backend function. Throws NewerSchemaVersionError for a newer saved version.
export function sanitizePersistedAppState(raw) {
  return sanitizeCurrentAppState(migrateState(raw));
}
