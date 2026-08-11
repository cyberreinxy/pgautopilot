import { Icon as IconifyIcon } from "@iconify/react";
import type { ComponentType } from "react";
import { cn } from "../lib/cn.js";

const SPINNER_PATHS = [
  { d: "M25 18c-.6 0-1-.4-1-1V9c0-.6.4-1 1-1s1 .4 1 1v8c0 .6-.4 1-1 1" },
  {
    d: "M25 42c-.6 0-1-.4-1-1v-8c0-.6.4-1 1-1s1 .4 1 1v8c0 .6-.4 1-1 1m4-23c-.2 0-.3 0-.5-.1c-.4-.3-.6-.8-.3-1.3l4-6.9c.3-.4.8-.6 1.3-.3c.4.3.6.8.3 1.3l-4 6.9c-.2.2-.5.4-.8.4M17 39.8c-.2 0-.3 0-.5-.1c-.4-.3-.6-.8-.3-1.3l4-6.9c.3-.4.8-.6 1.3-.3c.4.3.6.8.3 1.3l-4 6.9c-.2.2-.5.4-.8.4",
    opacity: 0.3,
  },
  {
    d: "M21 19c-.3 0-.6-.2-.8-.5l-4-6.9c-.3-.4-.1-1 .3-1.3s1-.1 1.3.3l4 6.9c.3.4.1 1-.3 1.3c-.2.2-.3.2-.5.2",
    opacity: 0.93,
  },
  {
    d: "M33 39.8c-.3 0-.6-.2-.8-.5l-4-6.9c-.3-.4-.1-1 .3-1.3s1-.1 1.3.3l4 6.9c.3.4.1 1-.3 1.3c-.2.1-.3.2-.5.2",
    opacity: 0.3,
  },
  {
    d: "M17 26H9c-.6 0-1-.4-1-1s.4-1 1-1h8c.6 0 1 .4 1 1s-.4 1-1 1",
    opacity: 0.65,
  },
  {
    d: "M41 26h-8c-.6 0-1-.4-1-1s.4-1 1-1h8c.6 0 1 .4 1 1s-.4 1-1 1",
    opacity: 0.3,
  },
  {
    d: "M18.1 21.9c-.2 0-.3 0-.5-.1l-6.9-4c-.4-.3-.6-.8-.3-1.3c.3-.4.8-.6 1.3-.3l6.9 4c.4.3.6.8.3 1.3c-.2.3-.5.4-.8.4",
    opacity: 0.86,
  },
  {
    d: "M38.9 33.9c-.2 0-.3 0-.5-.1l-6.9-4c-.4-.3-.6-.8-.3-1.3c.3-.4.8-.6 1.3-.3l6.9 4c.4.3.6.8.3 1.3c-.2.3-.5.4-.8.4",
    opacity: 0.3,
  },
  {
    d: "M11.1 33.9c-.3 0-.6-.2-.8-.5c-.3-.4-.1-1 .3-1.3l6.9-4c.4-.3 1-.1 1.3.3s.1 1-.3 1.3l-6.9 4c-.1.2-.3.2-.5.2",
    opacity: 0.44,
  },
  {
    d: "M31.9 21.9c-.3 0-.6-.2-.8-.5c-.3-.4-.1-1 .3-1.3l6.9-4c.4-.3 1-.1 1.3.3s.1 1-.3 1.3l-6.9 4c-.2.2-.3.2-.5.2",
    opacity: 0.3,
  },
];

export interface IconBaseProps {
  size?: number;
  className?: string;
  color?: string;
}

export interface IconProps extends IconBaseProps {
  name: string;
}

export function SpinnerIcon({ size = 16, className, color }: IconBaseProps) {
  return (
    <svg
      viewBox="0 0 50 50"
      width={size}
      height={size}
      role="img"
      aria-label="loading"
      className={cn("shrink-0 animate-spin", className)}
      style={color ? { color } : undefined}
    >
      {SPINNER_PATHS.map((path, index) => (
        <path key={index} fill="currentColor" opacity={path.opacity} d={path.d} />
      ))}
    </svg>
  );
}

export function PanelsIcon({ size = 16, className, color }: IconBaseProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
      className={cn("shrink-0", className)}
      style={color ? { color } : undefined}
    >
      <path d="M12.5 5C14.3856 5 15.3284 5 15.9142 5.58579C16.5 6.17157 16.5 7.11438 16.5 9V15C16.5 16.8856 16.5 17.8284 15.9142 18.4142C15.3284 19 14.3856 19 12.5 19H11.5C9.61438 19 8.67157 19 8.08579 18.4142C7.5 17.8284 7.5 16.8856 7.5 15L7.5 9C7.5 7.11438 7.5 6.17157 8.08579 5.58579C8.67157 5 9.61438 5 11.5 5L12.5 5Z" />
      <path
        d="M22 19H21.5C20.1193 19 19 17.8807 19 16.5L19 7.5C19 6.11929 20.1193 5 21.5 5L22 5"
        strokeLinecap="round"
      />
      <path
        d="M2 19H2.5C3.88071 19 5 17.8807 5 16.5L5 7.5C5 6.11929 3.88071 5 2.5 5L2 5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DashIcon({ size = 16, className, color }: IconBaseProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      style={color ? { color } : undefined}
    >
      <path d="M8 3v10" />
    </svg>
  );
}

export function GithubIcon({ size = 16, className, color }: IconBaseProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      style={color ? { color } : undefined}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12"
        fill="currentColor"
      />
    </svg>
  );
}

export function NpmIcon({ size = 16, className }: IconBaseProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <path fill="#c00" d="M0 0h24v24H0z" />
      <path fill="#fff" d="M11.918 2.578H2.577v18.844h9.34V7.33h4.752v14.092h4.752V2.578z" />
    </svg>
  );
}

const CUSTOM_ICONS: Record<string, ComponentType<IconBaseProps>> = {
  spinner: SpinnerIcon,
  panels: PanelsIcon,
  dash: DashIcon,
  github: GithubIcon,
  npm: NpmIcon,
};

export function Icon({ name, size = 16, className, color }: IconProps) {
  const Custom = CUSTOM_ICONS[name];
  if (Custom) {
    return <Custom size={size} className={className} color={color} />;
  }
  return (
    <IconifyIcon
      icon={name}
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      style={color ? { color } : undefined}
    />
  );
}
