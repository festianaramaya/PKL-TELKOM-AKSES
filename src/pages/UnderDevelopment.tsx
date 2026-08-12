import React from 'react';

interface UnderDevelopmentProps {
  title: string;
}

const UnderDevelopment: React.FC<UnderDevelopmentProps> = ({ title }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '60vh',
      backgroundColor: '#ffffff',
      borderRadius: '15px',
      boxShadow: '0px 4px 10px rgba(0,0,0,0.05)',
      padding: '40px',
      margin: '20px',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '64px', marginBottom: '16px' }}>🚧</div>
      <h2 style={{ color: '#031536', margin: '0 0 10px 0', fontFamily: 'sans-serif' }}>
        Fitur <span style={{ color: '#3333F4' }}>{title}</span> Sedang Dalam Pengembangan
      </h2>
      <p style={{ color: '#6E6C6C', maxWidth: '450px', fontSize: '14px', lineHeight: '1.6' }}>
        Modul ini sedang dikembangkan oleh tim SDI. Silakan kembali lagi nanti untuk menggunakan fitur ini.
      </p>
    </div>
  );
};

export default UnderDevelopment;
