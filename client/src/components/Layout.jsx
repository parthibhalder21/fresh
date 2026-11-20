import { NavLink, Outlet } from "react-router-dom";
import {
  Boxes, LayoutDashboard, LogOut, ScrollText, ShoppingBasket, SlidersHorizontal, Store, Tags,
} from "lucide-react";
import { useAuth } from "../auth.jsx";
import { Logo } from "./ui.jsx";

const NAV = {
  admin: [
    { section: "Network" },
    { to: "/overview", label: "Overview", icon: LayoutDashboard },
    { to: "/partners", label: "Partners", icon: Store },
    { to: "/audit", label: "Audit log", icon: ScrollText },
    { section: "Central warehouse" },
    { to: "/inventory", label: "Inventory", icon: Boxes },
    { to: "/orders", label: "Orders", icon: ShoppingBasket },
    { to: "/listings", label: "Listings", icon: Tags },
    { section: "System" },
    { to: "/policy", label: "Risk policy", icon: SlidersHorizontal },
  ],
  store: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/inventory", label: "Inventory", icon: Boxes },
    { to: "/orders", label: "Orders", icon: ShoppingBasket },
    { to: "/listings", label: "Listings", icon: Tags },
    { to: "/policy", label: "Risk policy", icon: SlidersHorizontal },
  ],
};

const ROLE_NAME = { admin: "HQ operations", store: "Store manager", merchant: "Local merchant", ngo: "NGO partner" };

export default function Layout() {
  const { user, org, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand">
          <Logo />
          <div>
            <div className="brand-name">FreshLoop</div>
            <div className="brand-tag">Local surplus network</div>
          </div>
        </NavLink>
        <nav className="nav">
          {NAV[user.role].map((item, i) =>
            item.section ? (
              <div key={i} className="nav-label">{item.section}</div>
            ) : (
              <NavLink key={item.to} to={item.to}>
                <item.icon size={17} />
                {item.label}
              </NavLink>
            )
          )}
        </nav>
        <div className="sidebar-foot">
          <div className="who">{user.name}</div>
          <div className="who-org">{org?.name}</div>
          <span className="role-pill">{ROLE_NAME[user.role]}</span>
          <button className="signout" onClick={logout}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
