import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../assets/MainLayout.css'; 

interface MainLayoutProps {
  children: React.ReactNode;
  pageTitle: string;
  activeMenu: string;
}

export default function MainLayout({ children, pageTitle, activeMenu }: MainLayoutProps) {
  const navigate = useNavigate();

  // === Logika Role ===
  const userRole = localStorage.getItem('role'); 

  // === Fungsi Logout ===
  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    if (window.confirm('Apakah Anda yakin ingin keluar?')) {
      localStorage.clear();
      window.location.href = '/login';
    }
  };

  // === Daftar Menu ===
  const menuList = [
    { id: 'welcome', label: 'Welcome', href: '/welcome', icon: '/images/mdi-home-variant1.svg' },
    { id: 'create-lop', label: 'Create LOP', href: '/create-lop', icon: '/images/frame0.svg' },
    { id: 'line-to-point', label: 'Line to Point', href: '/line-to-point', icon: '/images/frame1.svg' },
    { id: 'rename-placemarks', label: 'Rename Placemarks', href: '/rename-placemarks', icon: '/images/frame2.svg' },
    { id: 'centroid-polygon', label: 'Centroid Polygon', href: '/centroid-polygon', icon: '/images/frame3.svg' },
    { id: 'wkt-to-kml', label: 'WKT to KML', href: '/wkt-to-kml', icon: '/images/frame4.svg' },
    { id: 'kml-to-csv', label: 'KML to CSV', href: '/kml-to-csv', icon: '/images/vector2.svg' },
    { id: 'csv-to-kml', label: 'CSV to KML', href: '/csv-to-kml', icon: '/images/vector2.svg' },
    { id: 'kml-to-dxf', label: 'KML to DXF', href: '/kml-to-dxf', icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z'/%3E%3C/svg%3E",},
    { id: 'point-in-polygon', label: 'Point in Polygon', href: '/point-in-polygon', icon: '/images/mdi-circle-double0.svg' },
    { id: 'polygon-in-polygon', label: 'Polygon in Polygon', href: '/polygon-in-polygon', icon: '/images/vector4.svg',},
    { id: 'tagging', label: 'Tagging', href: '/tagging', icon: '/images/frame-500.svg',},
  ];

  if (userRole === 'admin') {
    menuList.push({
      id: 'user-management',
      label: 'Manajemen User',
      href: '/user-management',
      icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z'/%3E%3C/svg%3E",
    });
  }

  return (
    <div className="layout-wrapper">
      {/* === HEADER (Menggunakan Background Image dari CSS) === */}
      <header className="layout-header">
        <div className="header-status-area">
          {/* Badge Profil (Merah) - Titik Hijau & Connected Sudah Dihapus */}
          <div className="profile-badge">
            {userRole === 'admin' ? 'Admin' : 'SDI'}
          </div>
        </div>
      </header>

      {/* === AREA TENGAH === */}
      <div className="layout-body">
        {/* GAMBAR PETA UTAMA (Berada di lapisan paling bawah) */}
        <img className="body-bg-map" src="/images/peta-dunia.png" alt="Peta Indonesia" />

        {/* --- SIDEBAR KIRI --- */}
        <aside className="layout-sidebar">
          <nav className="sidebar-nav">
            {menuList.map((menu) => {
              const isActive = activeMenu === menu.id;
              return (
                <div
                  key={menu.id}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => navigate(menu.href)}
                >
                  <img
                    src={menu.icon}
                    alt={menu.label}
                    className="nav-icon"
                    style={{ filter: isActive ? 'brightness(0) invert(1)' : 'none' }}
                  />
                  <span className="nav-label">{menu.label}</span>
                </div>
              );
            })}
          </nav>

          <div className="sidebar-bottom">
            <div className="nav-item logout-item" onClick={handleLogout}>
              <img
                src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ef4444'%3E%3Cpath d='M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z'/%3E%3C/svg%3E"
                alt="Logout"
                className="nav-icon"
              />
              <span className="nav-label" style={{ color: '#ED1E28', fontWeight: 'bold' }}>Logout</span>
            </div>
          </div>
        </aside>

        {/* --- KONTEN UTAMA KANAN --- */}
        <main className="layout-content">
          
          {/* === HEADER OTOMATIS UNTUK SEMUA FITUR (Kecuali Welcome) === */}
          {activeMenu !== 'welcome' && (
            <div className="feature-page-header">
              <img 
                src={menuList.find(m => m.id === activeMenu)?.icon} 
                alt="Feature Icon" 
                className="feature-page-icon" 
              />
              <h2 className="feature-page-title">{pageTitle}</h2>
            </div>
          )}

          {/* Area konten bawaan fitur (seperti form Create LOP) */}
          <div className="feature-page-content">
            {children}
          </div>
          
        </main>
      </div>

      {/* === FOOTER === */}
      <footer className="layout-footer">
        <div className="footer-left">
          © 2026 Telkom Akses | Infrastructure Management Tool | Developed by <span className="text-red">SDI & KERJA PRAKTEK PENS</span>
        </div>
        <div className="footer-center">
          Version 3.4.1-Stable
        </div>
        <div className="footer-right">
          Cloud Deploy: Google Cloud Console
        </div>
      </footer>
    </div>
  );
}