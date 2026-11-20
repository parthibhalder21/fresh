import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import Layout from "./components/Layout.jsx";
import { Loading } from "./components/ui.jsx";
import Login from "./pages/shared/Login.jsx";
import Register from "./pages/shared/Register.jsx";
import Dashboard from "./pages/shared/Dashboard.jsx";
import Profile from "./pages/shared/Profile.jsx";
import Policy from "./pages/shared/Policy.jsx";
import Inventory from "./pages/store/Inventory.jsx";
import Listings from "./pages/store/Listings.jsx";
import OrdersBoard from "./pages/store/OrdersBoard.jsx";
import ShopLayout from "./shop/ShopLayout.jsx";
import ShopHome from "./shop/ShopHome.jsx";
import { OrderList, OrderTrack } from "./shop/Orders.jsx";
import Partners from "./pages/admin/Partners.jsx";
import Audit from "./pages/admin/Audit.jsx";

const HOME = { admin: "/overview", store: "/dashboard" };

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;

  if (!user) {
    return (
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  const r = user.role;

  // Local merchants and NGOs get the shopping app.
  if (r === "merchant" || r === "ngo") {
    return (
      <Routes>
        <Route element={<ShopLayout />}>
          <Route path="/" element={<ShopHome />} />
          <Route path="/orders" element={<OrderList />} />
          <Route path="/orders/:id" element={<OrderTrack />} />
          <Route path="/account" element={<div className="shop-page"><Profile /></div>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        {r === "admin" && <Route path="/overview" element={<Dashboard />} />}
        {r === "admin" && <Route path="/partners" element={<Partners />} />}
        {r === "admin" && <Route path="/audit" element={<Audit />} />}
        {r === "store" && <Route path="/dashboard" element={<Dashboard />} />}
        {(r === "admin" || r === "store") && <Route path="/inventory" element={<Inventory />} />}
        {(r === "admin" || r === "store") && <Route path="/listings" element={<Listings />} />}
        {(r === "admin" || r === "store") && <Route path="/orders" element={<OrdersBoard />} />}
        {(r === "admin" || r === "store") && <Route path="/policy" element={<Policy />} />}
        <Route path="*" element={<Navigate to={HOME[r]} replace />} />
      </Route>
    </Routes>
  );
}
