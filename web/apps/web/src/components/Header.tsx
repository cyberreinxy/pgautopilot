import { Icon, Logo } from "@pgautopilot/ui";
import { HealthBadge } from "../features/health/HealthBadge";
import { useTheme } from "../lib/theme-context";

export function Header() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 rounded-[10px] border border-pg-border bg-pg-surface px-3 shadow-pg-sm">
      <Logo iconColor="var(--color-pg-primary)" wordmarkColor="var(--color-pg-text)" size={28} />
      <Icon name="dash" size={16} className="text-pg-border" />
      <HealthBadge />
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          className="pg-icon-btn"
          aria-label="Toggle theme"
          onClick={toggleTheme}
        >
          <Icon
            name={theme === "dark" ? "solar:sun-linear" : "solar:moon-linear"}
            size={theme === "dark" ? 20 : 18}
          />
        </button>
        <a
          className="pg-icon-btn"
          href="https://github.com/cyberreinxy/pgautopilot"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub repository"
        >
          <Icon name="github" size={18} color="var(--color-pg-text)" />
        </a>
        <a
          className="pg-icon-btn"
          href="https://www.npmjs.com/search?q=pgautopilot"
          target="_blank"
          rel="noreferrer"
          aria-label="npm package"
        >
          <Icon name="npm" size={18} />
        </a>
      </div>
    </header>
  );
}
