// File purpose: Root application shell for tab layout, theme state, and startup flow.
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import AppSidebar from "./layout/AppSidebar";
import StartupSplash from "./components/StartupSplash";
import HomePage from "./pages/HomePage";

export default function App() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [showSplash, setShowSplash] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [hasLoadedLog, setHasLoadedLog] = useState(false);

  useEffect(() => {
    void getCurrentWindow().maximize();
  }, []);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("kapyah-theme");
    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    window.localStorage.setItem("kapyah-theme", theme);
  }, [theme]);

  useEffect(() => {
    function handleContextMenu(event: MouseEvent) {
      event.preventDefault();
    }

    function handleKeyDown(event: KeyboardEvent) {
      const isModifierPressed = event.ctrlKey || event.metaKey;
      const normalizedKey = event.key.toLowerCase();

      if (event.key === "F5") {
        event.preventDefault();
        return;
      }

      if (!isModifierPressed) {
        return;
      }

      if (normalizedKey === "r" || normalizedKey === "p" || normalizedKey === "s") {
        event.preventDefault();
      }
    }

    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function handleResetHome() {
    setHasLoadedLog(false);
    setActiveTab("Overview");
    setResetToken((value) => value + 1);
  }

  if (showSplash) {
    return <StartupSplash onComplete={() => setShowSplash(false)} />;
  }

  const shellClassName = [
    "app-shell",
    hasLoadedLog ? "" : "home-shell",
    hasLoadedLog && sidebarCollapsed ? "sidebar-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClassName}>
      {hasLoadedLog ? (
        <AppSidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          onResetHome={handleResetHome}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          theme={theme}
          onThemeToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        />
      ) : null}
      <HomePage
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        resetToken={resetToken}
        onLoadedStateChange={setHasLoadedLog}
        theme={theme}
        onThemeToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />
    </div>
  );
}
