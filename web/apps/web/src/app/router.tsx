import { lazy } from "react";
import type { ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";
import { RouteLoader } from "../components/RouteLoader";
import { RootLayout } from "../routes/root";

const OverviewPage = lazy(() =>
  import("../routes/overview").then((m) => ({ default: m.OverviewPage })),
);
const DashboardPage = lazy(() =>
  import("../routes/dashboard").then((m) => ({ default: m.DashboardPage })),
);
const SqlEditorPage = lazy(() =>
  import("../routes/sql-editor").then((m) => ({ default: m.SqlEditorPage })),
);
const SchemaPage = lazy(() => import("../routes/schema").then((m) => ({ default: m.SchemaPage })));
const TablesPage = lazy(() => import("../routes/tables").then((m) => ({ default: m.TablesPage })));
const MigrationsPage = lazy(() =>
  import("../routes/migrations").then((m) => ({ default: m.MigrationsPage })),
);
const LogsPage = lazy(() => import("../routes/logs").then((m) => ({ default: m.LogsPage })));
const SettingsPage = lazy(() =>
  import("../routes/settings").then((m) => ({ default: m.SettingsPage })),
);
const AuthPage = lazy(() => import("../routes/auth").then((m) => ({ default: m.AuthPage })));

function loaded(element: ReactNode) {
  return <RouteLoader>{element}</RouteLoader>;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: loaded(<OverviewPage />),
      },
      {
        path: "tables",
        element: loaded(<TablesPage />),
      },
      {
        path: "tools",
        element: loaded(<DashboardPage />),
      },
      {
        path: "sql",
        element: loaded(<SqlEditorPage />),
      },
      {
        path: "schema",
        element: loaded(<SchemaPage />),
      },
      {
        path: "migrations",
        element: loaded(<MigrationsPage />),
      },
      {
        path: "logs",
        element: loaded(<LogsPage />),
      },
      {
        path: "settings",
        element: loaded(<SettingsPage />),
      },
      {
        path: "auth",
        element: loaded(<AuthPage />),
      },
    ],
  },
]);
