import { Navigate, Outlet } from 'react-router-dom';

export default function AdminRoute() {
  const isLoggedIn = localStorage.getItem('isLoggedIn');
  const userRole = localStorage.getItem('userRole');

  // Jika belum login, tendang ke /login
  if (isLoggedIn !== 'true') {
    return <Navigate to="/login" replace />;
  }

  // Jika sudah login tapi BUKAN admin, tendang ke /welcome
  if (userRole !== 'admin') {
    return <Navigate to="/welcome" replace />;
  }

  // Jika valid sebagai admin, tampilkan halamannya
  return <Outlet />;
}
