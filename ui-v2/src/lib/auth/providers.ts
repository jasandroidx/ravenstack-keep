/**
 * Local Keep identity profiles for instant dev/sandbox authentication.
 * No external broker or OAuth client credentials required.
 */
export type AuthProvider = {
  providerId: string;
  idp: string;
  label: string;
  name: string;
  role: string;
  email: string;
  profileImageUrl?: string | null;
};

export const GROK_PROVIDERS: readonly AuthProvider[] = [
  {
    providerId: "keeper-jason",
    idp: "keeper",
    label: "Keeper (Jason Boyd)",
    name: "Jason Boyd",
    role: "Fortress Keeper & Sovereign",
    email: "jason@ravenstack.local",
    profileImageUrl: "/hall/portraits/valerie.jpg",
  },
  {
    providerId: "sentinel-operator",
    idp: "sentinel",
    label: "Sentinel Auditor",
    name: "Sentinel Auditor",
    role: "Watchtower Sentinel",
    email: "sentinel@ravenstack.local",
    profileImageUrl: null,
  },
  {
    providerId: "mechanic-valerie",
    idp: "valerie",
    label: "Valerie Mechanic",
    name: "Valerie Mechanic",
    role: "Fortress Mechanic",
    email: "valerie@ravenstack.local",
    profileImageUrl: "/hall/portraits/valerie.jpg",
  },
];

export const AUTH_PROVIDERS = GROK_PROVIDERS;
export type GrokProvider = AuthProvider;
