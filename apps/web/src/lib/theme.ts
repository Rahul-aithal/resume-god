const STORAGE_KEY = "rg-theme";

export type Theme = "light" | "dark";

function effective(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Flip the theme by toggling the class the stylesheet keys off; the choice
 * persists for future visits. index.html applies the stored value pre-paint. */
export function toggleTheme(): Theme {
  const next: Theme = effective() === "dark" ? "light" : "dark";
  document.documentElement.classList.toggle("dark", next === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private mode / storage disabled: theme still switches for this visit.
  }
  return next;
}

export function currentTheme(): Theme {
  return effective();
}
