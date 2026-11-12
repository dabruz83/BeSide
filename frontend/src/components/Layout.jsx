import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/App";
import { 
  LayoutDashboard, 
  Wrench, 
  Euro, 
  CalendarDays, 
  Megaphone, 
  UserCog,
  ClipboardList,
  LogOut,
  ChevronRight,
  Palette,
  MessageSquare
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const navItems = [
  { path: "/dashboard", label: "Bacheca", icon: LayoutDashboard },
  { path: "/jobs", label: "Lavori", icon: Wrench },
  { path: "/configurator", label: "Configuratore", icon: Palette },
  { path: "/finance", label: "Finanza", icon: Euro },
  { path: "/calendar", label: "Pianificazione", shortLabel: "Agenda", icon: CalendarDays },
  { path: "/onboarding", label: "Clienti", icon: ClipboardList },
  { path: "/subscription", label: "Abbonamento", icon: Euro },
  { path: "/profile", label: "Impostazioni", icon: UserCog },
  { path: "/support", label: "Assistenza", icon: MessageSquare },
];

const renderNavIcon = (item, className = "w-5 h-5") => (
  item.path === "/dashboard"
    ? <img src="/beside-icon.svg" alt="" aria-hidden="true" className={`${className} object-contain`} />
    : <item.icon className={className} />
);

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const touchStartRef = useRef(null);
  const isCalendarPage = location.pathname.startsWith("/calendar");

  const handleLogout = async () => {
    await logout();
  };

  const handleTouchStart = (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (!sidebarOpen && touch.clientX <= 28) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    } else if (sidebarOpen) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  };

  const handleTouchEnd = (event) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dy) > 80) return;
    if (!sidebarOpen && dx > 0) setSidebarOpen(true);
    if (sidebarOpen && dx < 0) setSidebarOpen(false);
  };

  const getInitials = (name) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const displayName = [user?.first_name || user?.firstName, user?.last_name || user?.lastName].filter(Boolean).join(" ")
    || user?.name
    || user?.email
    || "Profilo";
  const businessName = user?.business_name || user?.businessName || user?.company_name || user?.company?.name || "La tua attività";
  const roleLabel = user?.role_label || user?.role || "Titolare";

  return (
    <div
      className={(isCalendarPage ? "h-[100dvh] overflow-hidden " : "min-h-screen ") + "bg-background"}
      style={{ "--mobile-nav-height": "72px" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-primary text-primary-foreground h-screen fixed left-0 top-0 z-40">
        {/* Logo */}
        <div className="p-6 border-b border-white/10">
          <img src="/beside-logo.svg" alt="Beside" className="h-9 w-auto max-w-full object-contain object-left" />
          <p className="text-white/60 text-sm mt-1">Gestione Installatori</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `sidebar-item ${isActive ? "active" : ""}`
              }
            >
              {renderNavIcon(item)}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={user?.picture} alt={user?.name} />
              <AvatarFallback className="bg-white/20 text-white">
                {getInitials(user?.name || user?.business_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.business_name || user?.name}</p>
              <p className="text-xs text-white/60 truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-white/70 hover:text-white hover:bg-white/10"
            onClick={handleLogout}
            data-testid="sidebar-logout-btn"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Esci
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-border z-40 flex items-center justify-between px-4">
        <h1 className="text-xl font-bold text-primary" style={{ fontFamily: 'Barlow, sans-serif' }}>
          BESIDE
        </h1>
      </header>

      {!sidebarOpen && (
        <button
          type="button"
          aria-label="Apri menu"
          aria-expanded={sidebarOpen}
          className="mobile-menu-tab md:hidden"
          onClick={() => setSidebarOpen(true)}
          data-testid="mobile-menu-tab"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside 
        className={`mobile-sidebar md:hidden fixed top-14 left-0 w-72 bg-white border-r border-border rounded-r-2xl shadow-[8px_0_28px_rgba(15,23,42,0.18)] z-50 transform transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-slate-200/80 p-4">
          <img src="/beside-logo.svg" alt="Beside" className="mb-4 h-8 w-auto max-w-full object-contain object-left" />
          <NavLink to="/profile" onClick={() => setSidebarOpen(false)} className="mobile-user-card block">
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14 shrink-0 ring-2 ring-white shadow-sm">
                <AvatarImage src={user?.picture} alt={displayName} />
                <AvatarFallback className="bg-primary text-white text-base">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">Benvenuto</p>
                <p className="break-words text-base font-semibold leading-tight text-primary">{displayName}</p>
                <p className="truncate text-xs text-slate-600">{businessName}</p>
                <p className="truncate text-[11px] text-slate-500">{roleLabel}</p>
              </div>
            </div>
          </NavLink>
        </div>
        <nav className="p-4 space-y-1.5">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex min-h-12 items-center justify-between gap-3 px-4 py-3 rounded-xl transition-colors ${
                  isActive 
                    ? "bg-sky-100 text-primary ring-1 ring-sky-200"
                    : "text-muted-foreground hover:bg-muted"
                }`
              }
            >
              <span className="flex min-w-0 items-center gap-3">
              {renderNavIcon(item, "w-5 h-5 shrink-0")}
                <span className="truncate">{item.label}</span>
              </span>
              {(["/finance", "/onboarding", "/subscription", "/profile", "/support"].includes(item.path)) && (
                <ChevronRight className="h-4 w-4 shrink-0 text-sky-500/80" aria-hidden="true" />
              )}
            </NavLink>
          ))}
          
          {/* Logout button in mobile menu */}
          <div className="pt-4 mt-4 border-t border-border">
            <button
              onClick={() => {
                setSidebarOpen(false);
                handleLogout();
              }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-red-600 hover:bg-red-50 w-full"
              data-testid="mobile-logout-btn"
            >
              <LogOut className="w-5 h-5" />
              <span>Esci</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border flex justify-around items-center z-40">
        {[navItems[0], navItems[1], navItems[2], navItems[4]].map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `nav-item mobile-bottom-nav-item ${isActive ? "active" : ""}`
            }
          >
            <span className="mobile-bottom-nav-icon-shell">
              {renderNavIcon(item, "mobile-bottom-nav-icon w-6 h-6")}
            </span>
            <span className="mobile-bottom-nav-label">{item.shortLabel || item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Main Content */}
      <main className={`md:ml-64 pt-14 md:pt-0 ${isCalendarPage ? "calendar-main h-[100dvh] overflow-hidden md:pb-0" : "pb-24 md:pb-8 min-h-screen"}`}>
        <div className={`${isCalendarPage ? "h-full overflow-hidden " : ""}p-4 md:p-8 max-w-7xl mx-auto animate-fade-in`}>
          {children}
        </div>
      </main>
    </div>
  );
};
