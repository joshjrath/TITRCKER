/** The Settings page's sections, in page order. Ids double as URL fragments (e.g. /settings#tracking). */
export const SETTINGS_SECTIONS = [
  { id: "tracking", label: "Tracking" },
  { id: "tithe-rate", label: "Tithe rate" },
  { id: "opening-balances", label: "Opening balances" },
  { id: "security", label: "Security" },
  { id: "data", label: "Data" },
  { id: "account", label: "Account" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];
