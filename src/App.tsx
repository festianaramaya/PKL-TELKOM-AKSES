import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import Welcome from "./pages/Welcome";

import MainLayout from "./components/MainLayout";

// IMPORT BARU UNTUK SISTEM LOGIN & MANAJEMEN USER
import ProtectedRoute from "./components/ProtectedRoute"; 
import AdminRoute from "./components/AdminRoute"; 
import UserManagement from "./pages/UserManagement"; 

// === TAMBAHKAN IMPORT FILE fitur BARU DI SINI ===
import KmlToCsv from "./pages/KmlToCsv";
import CreateLop from "./pages/CreateLop";
import KmlToDxf from "./pages/KmlToDxf";
import LineToPoint from './pages/LineToPoint';
import RenamePlacemarks from './pages/RenamePlacemarks';
import CentroidPolygon from './pages/CentroidPolygon';
import WktToKml from './pages/WktToKml';
import PointInPolygon from './pages/PointInPolygon';
import PolygonInPolygon from './pages/PolygonInPolygon';
import CsvToKmlConverter from "./pages/CsvToKmlConverter";
import TaggingMaps from "./pages/TaggingMaps";

// Placeholder yang tetap memiliki Sidebar & Header
function UnderDevelopment({ title, activeMenu }: { title: string; activeMenu: string }) {
  return (
    <MainLayout pageTitle={title} activeMenu={activeMenu}>
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "60vh",
        fontFamily: "Inter, sans-serif",
        textAlign: "center",
        padding: "20px"
      }}>
        <div style={{ fontSize: "50px", marginBottom: "15px" }}>🚧</div>
        <h2 style={{ color: "#031536", margin: "0 0 10px 0" }}>
          Fitur <span style={{ color: "#ED1E28" }}>{title}</span> Sedang Dibuat
        </h2>
        <p style={{ color: "#6e6c6c", fontSize: "14px", maxWidth: "400px" }}>
          Halaman ini belum memiliki isi karena fitur masih dalam tahap pengembangan oleh tim.
        </p>
      </div>
    </MainLayout>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Route Autentikasi (Murni tanpa Header/Sidebar) */}
        <Route path="/login" element={<LoginPage />} />

        {/* --- RUTE UNTUK SEMUA USER YANG SUDAH LOGIN (User Biasa & Admin) --- */}
        <Route element={<ProtectedRoute />}>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/kml-to-dxf" element={<KmlToDxf />} />
          {/* === GANTI RUTE KML TO CSV MENJADI SEPERTI INI === */}
          <Route path="/kml-to-csv" element={<KmlToCsv />} />
          <Route path="/create-lop" element={<CreateLop />} />
          <Route path="line-to-point" element={<LineToPoint />} />
          <Route path="rename-placemarks" element={<RenamePlacemarks />} />
          <Route path="centroid-polygon" element={<CentroidPolygon />} />
          <Route path="wkt-to-kml" element={<WktToKml />} />
          <Route path="point-in-polygon" element={<PointInPolygon />} />
          <Route path="polygon-in-polygon" element={<PolygonInPolygon />} />
          <Route path="/csv-to-kml" element={<CsvToKmlConverter />} />
          <Route path="/tagging" element={<TaggingMaps />}/>

          {/* Fitur-Fitur Placeholder (Tetap menggunakan Layout) */}
          <Route path="/create-lop" element={<UnderDevelopment title="Create LOP" activeMenu="create-lop" />} />
          <Route path="/line-to-point" element={<UnderDevelopment title="Line to Point" activeMenu="line-to-point" />} />
          <Route path="/rename-placemarks" element={<UnderDevelopment title="Rename Placemarks" activeMenu="rename-placemarks" />} />
          <Route path="/centroid-polygon" element={<UnderDevelopment title="Centroid Polygon" activeMenu="centroid-polygon" />} />
          <Route path="/wkt-to-kml" element={<UnderDevelopment title="WKT to KML" activeMenu="wkt-to-kml" />} />
          <Route path="/kml-to-csv" element={<UnderDevelopment title="KML to CSV" activeMenu="kml-to-csv" />} />
          <Route path="/point-in-polygon" element={<UnderDevelopment title="Point in Polygon" activeMenu="point-in-polygon" />} />
          <Route path="/polygon-in-polygon" element={<UnderDevelopment title="Polygon in Polygon" activeMenu="polygon-in-polygon" />} />
        </Route>

        {/* --- RUTE KHUSUS ADMIN --- */}
        <Route element={<AdminRoute />}>
          <Route path="/user-management" element={<UserManagement />} />
        </Route>

        {/* Redirect jika route tidak ditemukan */}
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}
