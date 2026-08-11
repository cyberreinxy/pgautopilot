import type { NotificationTone } from "../components/NotificationBar";

export interface NotificationConfig {
  message: string;
  tone: NotificationTone;
}

export const ANNOUNCEMENT: NotificationConfig = {
  message:
    "This project is in an early experimental stage. Some features are still being refined, so you may occasionally run into bugs or breaking changes. Thanks for being here early. Better things are on the way.",
  tone: "warning",
};
