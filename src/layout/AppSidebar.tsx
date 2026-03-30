// File purpose: Branded application sidebar with navigation, theme toggle, and KapYah links.
import { invoke } from "@tauri-apps/api/core";
import companyMark from "../assets/kapyah-company-mark-redico.png";
import companyMarkBlack from "../assets/kapyah-company-mark-black.jpeg";

type AppSidebarProps = {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onResetHome: () => void;
  collapsed: boolean;
  onToggle: () => void;
  theme: "dark" | "light";
  onThemeToggle: () => void;
};

const navigationItems = [
  { id: "Overview", label: "Overview", short: "OV" },
  { id: "Timeline", label: "Timeline", short: "TL" },
  { id: "Power", label: "Power", short: "PW" },
  { id: "Vibration", label: "Vibration", short: "VB" },
  { id: "RC Info", label: "RC Info", short: "RC" },
  { id: "Map", label: "Map", short: "MP" },
  { id: "Messages", label: "Messages", short: "MS" },
  { id: "Reports", label: "Reports", short: "RP" },
  { id: "Help & Support", label: "Help & Support", short: "HS" },
];

export default function AppSidebar({
  activeTab,
  onSelectTab,
  onResetHome,
  collapsed,
  onToggle,
  theme,
  onThemeToggle,
}: AppSidebarProps) {
  function openKapYahSite() {
    void invoke("open_external_url", { url: "https://kapyah.com/" });
  }

  return (
    <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
      <div className="sidebar-top">
        <div className="sidebar-top-bar">
          <button className="sidebar-toggle" type="button" onClick={onToggle}>
            {collapsed ? ">" : "<"}
          </button>

          {!collapsed ? (
            <button
              className={`theme-toggle ${theme === "light" ? "is-light" : ""}`}
              type="button"
              onClick={onThemeToggle}
              aria-label={`Switch to ${theme === "dark" ? "day" : "dark"} mode`}
              title={theme === "dark" ? "Switch to day mode" : "Switch to dark mode"}
            >
              <span className="theme-toggle-track">
                <span className="theme-toggle-thumb">
                  <img src={theme === "light" ? companyMarkBlack : companyMark} alt="" />
                </span>
              </span>
            </button>
          ) : null}
        </div>

        <div className="product-brand">
          {!collapsed ? (
            <div className="product-brand-copy">
              <div className="product-brand-header">
                <button className="brand-mark-button" type="button" onClick={openKapYahSite} title="Open KapYah website">
                  <img className="company-mark" src={companyMark} alt="KapYah Industries logo" />
                </button>
                <button className="product-brand-button" type="button" onClick={onResetHome}>
                  <div className="product-title-stack">
                    <p className="product-name">KapYah</p>
                    <p className="product-subname">LogMiner</p>
                  </div>
                </button>
              </div>
              <p className="company-line">by KapYah Industries Pvt. Ltd.</p>
            </div>
          ) : (
            <button className="brand-mark-button" type="button" onClick={openKapYahSite} title="Open KapYah website">
              <img className="company-mark" src={companyMark} alt="KapYah Industries logo" />
            </button>
          )}
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary modules">
        {navigationItems.map((item) => {
          const isActive = item.id === activeTab;
          return (
            <button
              key={item.id}
              className={isActive ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => onSelectTab(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-icon">{item.short}</span>
              {!collapsed ? <span className="nav-label">{item.label}</span> : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}






