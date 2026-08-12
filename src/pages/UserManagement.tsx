import React, { useEffect, useState } from 'react';
import MainLayout from '../components/MainLayout';

export default function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  // Menyimpan state (status) password mana yang sedang di-klik 'Lihat'
  const [visiblePasswords, setVisiblePasswords] = useState<Record<number, boolean>>({});

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const res = await fetch('/api/users');
    const data = await res.json();
    setUsers(data);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername, password: newPassword, role: 'user' })
    });
    setNewUsername('');
    setNewPassword('');
    fetchUsers(); 
  };

  const handleDelete = async (id: number) => {
    if(window.confirm("Yakin hapus user ini?")) {
      await fetch(`/api/users/${id}`, { method: 'DELETE' });
      fetchUsers(); 
    }
  };

  // Fungsi untuk membolak-balik status tampilkan/sembunyikan password
  const togglePasswordVisibility = (id: number) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <MainLayout pageTitle="Manajemen User" activeMenu="user-management">
      <div style={{ padding: '24px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '15px', color: '#031536' }}>Tambah User Baru</h3>
        
        <form onSubmit={handleCreateUser} style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
          <input 
            type="text" 
            placeholder="Username" 
            value={newUsername} 
            onChange={e => setNewUsername(e.target.value)} 
            required 
            style={{ padding: '10px 14px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
          />
          <input 
            type="password" 
            placeholder="Password" 
            value={newPassword} 
            onChange={e => setNewPassword(e.target.value)} 
            required 
            style={{ padding: '10px 14px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
          />
          <button type="submit" style={{ padding: '10px 16px', fontSize: '13px', background: '#0BA567', color: '#fff', fontWeight: 'bold', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
            + Simpan User
          </button>
        </form>

        <h3 style={{ color: '#031536', marginBottom: '16px', fontSize: '15px' }}>Daftar Akun Pengguna</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '12px' }}>ID</th>
                <th style={{ padding: '12px' }}>Username</th>
                <th style={{ padding: '12px' }}>Role</th>
                <th style={{ padding: '12px' }}>Password</th>
                <th style={{ padding: '12px' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user: any) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '12px', fontWeight: 'bold' }}>#{user.id}</td>
                  <td style={{ padding: '12px' }}>{user.username}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ 
                      padding: '4px 8px', 
                      backgroundColor: user.role === 'admin' ? '#fee2e2' : '#e0f2fe',
                      color: user.role === 'admin' ? '#ef4444' : '#0284c7',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase'
                    }}>
                      {user.role}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {/* Jika state visible = true, tampilkan password. Jika false, tampilkan bulatan */}
                    <span style={{ fontFamily: visiblePasswords[user.id] ? 'inherit' : 'monospace', marginRight: '10px' }}>
                      {visiblePasswords[user.id] ? user.password : '••••••••'}
                    </span>
                    <button 
                      onClick={() => togglePasswordVisibility(user.id)}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        color: '#3182ce', 
                        cursor: 'pointer', 
                        fontSize: '12px',
                        textDecoration: 'underline'
                      }}
                    >
                      {visiblePasswords[user.id] ? 'Sembunyikan' : 'Lihat'}
                    </button>
                  </td>
                  <td style={{ padding: '12px' }}>
                    {/* Cegah admin menghapus dirinya sendiri */}
                    {user.username !== 'admin' ? (
                      <button 
                        onClick={() => handleDelete(user.id)} 
                        style={{ color: '#ef4444', cursor: 'pointer', border: 'none', background: 'none', fontWeight: 'bold' }}
                      >
                        Hapus
                      </button>
                    ) : (
                      <span style={{ color: '#94a3b8' }}>-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}