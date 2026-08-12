import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; 
import '../assets/LoginPage.css';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState(''); 
  const navigate = useNavigate(); 

  const handleLogin = async () => {
    // 1. Reset pesan error setiap kali tombol ditekan
    setErrorMsg('');

    // 2. Validasi input kosong
    if (!username || !password) {
      setErrorMsg('Username dan Password harus diisi!');
      return;
    }

    try {
      // 3. Panggil API Backend Node.js/SQLite Anda
      // === KUNCI PERBAIKAN: Gunakan URL Relatif (/api/login) ===
      // Ini akan otomatis memakai HTTPS dan port yang sedang digunakan oleh domain.
      const response = await fetch('/api/login', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log('Login sukses:', data);
        
        // === KUNCI UTAMA: Harus persis dengan yang dicari ProtectedRoute ===
        localStorage.setItem('isLoggedIn', 'true'); 
        
        // Simpan data lainnya untuk kebutuhan MainLayout
        localStorage.setItem('username', data.username);
        localStorage.setItem('role', data.role);
        localStorage.setItem('userRole', data.role); 

        if (data.token) {
          localStorage.setItem('token', data.token);
        }

        // Arahkan ke halaman welcome
        window.location.href = '/welcome'; 
      } else {
        // ... (kode error bawaan) ...
        // 4b. Jika Login Gagal (Password salah, dll)
        setErrorMsg(data.message || 'Login gagal, periksa kembali kredensial Anda.');
      }
    } catch (error) {
      console.error('Error saat login:', error);
      setErrorMsg('Terjadi kesalahan pada server. Coba lagi nanti.');
    }
  };

  return (
    <div className="login-container">
      {/* Background Peta Full Screen */}
      <img className="bg-map" src="/images/image-30.png" alt="Background" />

      {/* === HEADER KIRI (LOGO KESATUAN) === */}
      <div className="header-left">
        <img 
          className="logo-valora-full" 
          src="/images/logo valora3.svg" 
          alt="VALORA Logo Lengkap" 
        />
      </div>

      {/* === HEADER KANAN (LOGO TELKOM AKSES) === */}
      <div className="header-right">
        <img 
          className="logo-ta" 
          src="/images/logo TA.svg" 
          alt="Telkom Akses Logo" 
        />
      </div>

      {/* === KOTAK LOGIN TENGAH === */}
      <div className="login-card">
        <div className="login-title">Login</div>
        
        <div className="input-group">
          <label>Enter Username</label>
          <input
            type="text"
            placeholder="Masukkan username anda"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="input-group">
          <label>Enter Password</label>
          <input
            type="password"
            placeholder="Masukkan password anda"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            // Tambahkan event onKeyDown agar bisa login pakai tombol "Enter"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleLogin();
            }}
          />
        </div>

        {/* Menampilkan pesan error jika ada */}
        {errorMsg && <div className="error-message" style={{ color: 'red', fontSize: '12px', marginBottom: '10px' }}>{errorMsg}</div>}

        <button className="login-btn" onClick={handleLogin}>
          Login
        </button>
      </div>
    </div>
  );
};

export default LoginPage;