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
  Menu,
  X,
  Palette,
  MessageSquare
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  { path: "/profile", label: "Profilo", icon: UserCog },
  { path: "/support", label: "Assistenza", icon: MessageSquare },
];

export const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navCompact, setNavCompact] = useState(false);
  const scrollIntentRef = useRef({ direction: 0, distance: 0 });
  const isCalendarPage = location.pathname.startsWith("/calendar");

  useEffect(() => {
    setNavCompact(false);
    scrollIntentRef.current = { direction: 0, distance: 0 };
  }, [location.pathname]);

  useEffect(() => {
    const scrollPositions = new WeakMap();

    const trackVerticalScroll = (target) => {
      if (!target || typeof target.scrollTop !== "number") return;
      const currentTop = target.scrollTop;
      const previousTop = scrollPositions.get(target);
      scrollPositions.set(target, currentTop);
      if (previousTop === undefined) return;

      const delta = currentTop - previousTop;
      if (Math.abs(delta) < 1) return;
      if (currentTop <= 1) {
        setNavCompact(false);
        scrollIntentRef.current = { direction: 0, distance: 0 };
        return;
      }

      const direction = delta > 0 ? 1 : -1;
      const intent = scrollIntentRef.current;
      if (intent.direction !== direction) {
        intent.direction = direction;
        intent.distance = 0;
      }
      intent.distance += Math.abs(delta);

      if (direction > 0 && intent.distance >= 18) {
        setNavCompact(true);
        intent.distance = 0;
      } else if (direction < 0 && intent.distance >= 12) {
        setNavCompact(false);
        intent.distance = 0;
      }
    };

    const handleElementScroll = (event) => {
      if (event.target !== document) trackVerticalScroll(event.target);
    };
    const handleWindowScroll = () => trackVerticalScroll(document.scrollingElement);

    document.addEventListener("scroll", handleElementScroll, { capture: true, passive: true });
    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    return () => {
      document.removeEventListener("scroll", handleElementScroll, true);
      window.removeEventListener("scroll", handleWindowScroll);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  const getInitials = (name) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <div
      className={(isCalendarPage ? "h-[100dvh] overflow-hidden " : "min-h-screen ") + "bg-background"}
      style={{ "--mobile-nav-height": navCompact ? "54px" : "72px" }}
    >
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-primary text-primary-foreground h-screen fixed left-0 top-0 z-40">
        {/* Logo */}
        <div className="p-6 border-b border-white/10">
          <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Barlow, sans-serif' }}>
            BESIDE
          </h1>
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
              <item.icon className="w-5 h-5" />
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
        <Button
          variant="ghost"
          size="icon"
          className="h-12 w-12"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          data-testid="mobile-menu-btn"
        >
          {sidebarOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
        </Button>
      </header>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside 
        className={`mobile-sidebar md:hidden fixed top-14 left-0 w-64 bg-white border-r border-border z-50 transform transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-muted"
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
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
      <nav className={`mobile-bottom-nav md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border flex justify-around items-center z-40 ${navCompact ? "is-compact" : ""}`}>
        {navItems.slice(0, 5).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `nav-item mobile-bottom-nav-item ${isActive ? "active" : ""}`
            }
          >
            <span className="mobile-bottom-nav-icon-shell">
              <item.icon className="mobile-bottom-nav-icon w-6 h-6" />
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
