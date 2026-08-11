import { Icon } from "./Icon.js";

interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner({ size = 20, className }: SpinnerProps) {
  return <Icon name="spinner" size={size} className={className} />;
}
