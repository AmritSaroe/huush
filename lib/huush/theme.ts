import { useColorScheme } from "react-native";

import type { ReaderTheme } from "./models";

export type HuushPalette = {
  canvas: string;
  surface: string;
  surfaceRaised: string;
  ink: string;
  muted: string;
  faint: string;
  accent: string;
  accentSoft: string;
  divider: string;
  danger: string;
  isDark: boolean;
};

const light: HuushPalette = {
  canvas: "#F6F1E8",
  surface: "#FFFDF8",
  surfaceRaised: "#FFFFFF",
  ink: "#24211D",
  muted: "#766F65",
  faint: "#A49B8D",
  accent: "#7F9C45",
  accentSoft: "#E5EDCF",
  divider: "#DED6C9",
  danger: "#A94C44",
  isDark: false,
};

const dark: HuushPalette = {
  canvas: "#161616",
  surface: "#202020",
  surfaceRaised: "#282828",
  ink: "#F4F1EB",
  muted: "#B8B2A8",
  faint: "#7A756D",
  accent: "#B7DA63",
  accentSoft: "#303B1F",
  divider: "#353535",
  danger: "#E8867C",
  isDark: true,
};

const sepia: HuushPalette = {
  canvas: "#E8DCC6",
  surface: "#F1E7D4",
  surfaceRaised: "#F8F0E2",
  ink: "#3E2723",
  muted: "#75614F",
  faint: "#9D8971",
  accent: "#6F863D",
  accentSoft: "#DDE4BD",
  divider: "#D1C0A5",
  danger: "#923F38",
  isDark: false,
};

export function getPalette(theme: ReaderTheme, systemScheme: "light" | "dark" | null | undefined): HuushPalette {
  if (theme === "sepia") return sepia;
  if (theme === "dark") return dark;
  if (theme === "light") return light;
  return systemScheme === "dark" ? dark : light;
}

export function useHuushPalette(theme: ReaderTheme): HuushPalette {
  return getPalette(theme, useColorScheme());
}
