import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Icon, Sidebar, SidebarNav } from "@pgautopilot/ui";
import { cn } from "../lib/cn";
import { ANNOUNCEMENT } from "../lib/notification";
import { Header } from "./Header";
import { NotificationBar } from "./NotificationBar";

const LINKS = [
  { to: "/", label: "Home", icon: "solar:home-smile-linear" },
  { to: "/tables", label: "Tables", icon: "streamline-flex:table" },
  { to: "/sql", label: "SQL Editor", icon: "solar:code-linear" },
  { to: "/tools", label: "Tools", icon: "solar:box-minimalistic-linear" },
  { to: "/schema", label: "Schema", icon: "solar:database-linear" },
  {
    to: "/migrations",
    label: "Migrations",
    icon: "fluent:text-arrow-down-right-column-24-regular",
  },
  { to: "/logs", label: "Logs", icon: "solar:clipboard-list-linear" },
  { to: "/settings", label: "Settings", icon: "solar:settings-linear" },
];

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [noticeVisible, setNoticeVisible] = useState(true);

  return (
    <div className="flex h-screen flex-col overflow-hidden px-1.5">
      <div className="flex shrink-0 flex-col pt-1.5">
        <NotificationBar
          visible={noticeVisible}
          onClose={() => setNoticeVisible(false)}
          message={ANNOUNCEMENT.message}
          tone={ANNOUNCEMENT.tone}
        />
        <Header />
      </div>
      <div className="flex min-h-0 flex-1 pb-1.5 pt-1.5">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((value) => !value)}
          footer={
            <button type="button" className="pg-nav-item" aria-label="Account">
              <span className="pg-nav-icon">
                <Icon name="solar:user-linear" size={18} />
              </span>
              <span className="pg-nav-label">Account</span>
            </button>
          }
        >
          <SidebarNav>
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) => cn("pg-nav-item", isActive && "pg-nav-item-active")}
              >
                <span className="pg-nav-icon">
                  <Icon name={link.icon} size={18} />
                </span>
                <span className="pg-nav-label">{link.label}</span>
              </NavLink>
            ))}
          </SidebarNav>
        </Sidebar>
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
