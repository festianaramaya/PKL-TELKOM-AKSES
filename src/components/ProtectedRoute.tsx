import { Navigate, Outlet } from 'react-router-dom';

export default function ProtectedRoute() {
  // Mengecek apakah ada tiket 'isLoggedIn' yang bernilai 'true' di memori browser
  const isLoggedIn = localStorage.getItem('isLoggedIn');

  // Jika tiketnya valid, izinkan masuk ke halaman fitur (Outlet)
  // Jika tidak valid, tendang kembali ke halaman '/login'
  return isLoggedIn === 'true' ? <Outlet /> : <Navigate to="/login" replace />;
}
