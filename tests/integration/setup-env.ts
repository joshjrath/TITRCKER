// Runs in every integration test worker before the test files load.
import { loadTestDatabaseUrl } from "./helpers/env";

const testUrl = loadTestDatabaseUrl();

// The app's db client reads DATABASE_URL lazily, so it now targets the test database.
process.env.DATABASE_URL = testUrl;
process.env.TENTH_TEST_DB_ACTIVE = "1";
process.env.TZ = "UTC";
process.env.BETTER_AUTH_SECRET ??= "integration-test-secret-integration-test-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.OWNER_EMAIL ??= "owner@example.test";
