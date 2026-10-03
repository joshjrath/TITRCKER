import { test as setup } from "@playwright/test";

import { AUTH_STATE, signIn } from "./helpers";

/** Signs in once after the journey (which signs out) and stores the session for the security and visual projects. */
setup("sign in and save the session", async ({ page }) => {
  await signIn(page);
  await page.context().storageState({ path: AUTH_STATE });
});
