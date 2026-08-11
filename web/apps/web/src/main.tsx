import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { initGlobalOverlayScrollbars } from "@pgautopilot/ui";
import { router } from "./app/router";
import "./styles/globals.css";

initGlobalOverlayScrollbars();

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
