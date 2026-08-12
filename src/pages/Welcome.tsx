import React from 'react';
import MainLayout from '../components/MainLayout';
import '../assets/vars_Welcome.css'; 

const Welcome: React.FC = () => {
  return (
    <MainLayout activeMenu="welcome" pageTitle="Welcome">
      <div className="welcome-container">
        <div className="welcome-content">
          
          {/* Logo Tengah */}
          <img
            src="/images/logo_konten_wrlcome2.svg" 
            alt="VALORA Icon"
            className="welcome-center-icon"
          />
    
          
          {/* Deskripsi */}
          <p className="welcome-desc">
            Platform lengkap untuk mengelola, mengonversi, dan menganalisis
            data geospasial dalam format KML. Dengan berbagai alat yang
            tersedia, Anda dapat dengan mudah memproses data geografis
            untuk kebutuhan pemetaan dan analisis.
          </p>
          
        </div>
      </div>
    </MainLayout>
  );
};

export default Welcome;