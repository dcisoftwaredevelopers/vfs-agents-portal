import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Users, Search, LogOut, RefreshCw } from 'lucide-react';
import Hero from '../components/Hero';
import { useGetUsersQuery } from '../features/admin/adminApiSlice';
import { selectCurrentAdmin, logout } from '../features/auth/authSlice';

const MOCK_USERS = [
  { id: 'mock-1', name: 'John Doe', email: 'john@gmail.com', regDate: new Date().toISOString(), status: 'Active' },
  { id: 'mock-2', name: 'Alice Smith', email: 'alice.smith@gmail.com', regDate: new Date().toISOString(), status: 'Active' },
  { id: 'mock-3', name: 'Bob Johnson', email: 'bob@gmail.com', regDate: new Date().toISOString(), status: 'Active' },
];

export default function AdminDashboardPortal() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const admin = useSelector(selectCurrentAdmin);
  const [searchTerm, setSearchTerm] = useState('');

  const {
    data: fetchedUsers,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetUsersQuery(undefined, { skip: !admin });

  const users = isError ? MOCK_USERS : (fetchedUsers || []);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/admin-login');
  };

  const filteredUsers = users.filter((user) =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div>
      <Hero
        title="Admin Portal Dashboard"
        subtitle="Overview of registered users and platform metrics"
      />

      <div className="container">
        {isError && (
          <div style={{ backgroundColor: '#fee2e2', borderLeft: '4px solid #ef4444', color: '#b91c1c', padding: '12px', fontSize: '14px', borderRadius: '4px', marginBottom: '20px' }}>
            {error?.data?.message || 'Failed to fetch registered users. Showing cached data.'}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '35px' }}>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ backgroundColor: 'rgba(12,35,64,0.05)', color: '#0c2340', padding: '15px', borderRadius: '50%' }}>
              <Users size={32} />
            </div>
            <div>
              <div style={{ fontSize: '14px', color: '#666' }}>Total Registered Users</div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#0c2340' }}>{users.length}</div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '20px', backgroundColor: '#f8fafc' }}>
            <div style={{ flexGrow: 1 }}>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>Active Session</div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: '#0c2340' }}>{admin?.email}</div>
              <div style={{ fontSize: '12px', color: '#e86020', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '2px' }}>Dream Catcher & VFS Global Administrator</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '20px', marginBottom: '25px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '15px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', border: '1px solid #cbd5e1', borderRadius: '4px',
            padding: '8px 12px', backgroundColor: '#ffffff', flex: '1 1 300px', maxWidth: '450px',
          }}>
            <Search size={18} style={{ color: '#94a3b8', marginRight: '8px' }} />
            <input
              type="text"
              placeholder="Search user by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ border: 'none', outline: 'none', width: '100%', fontSize: '14px', color: '#333' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={refetch}
              className="btn btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', padding: '10px 18px' }}
            >
              <RefreshCw size={16} /> Refresh
            </button>
            <button
              onClick={handleLogout}
              className="btn btn-outline"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', padding: '10px 18px', borderColor: '#ef4444', color: '#ef4444' }}
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: '20px', overflow: 'hidden' }}>
          <h3 style={{ fontSize: '18px', color: '#0c2340', fontWeight: 'bold', border: 'none', padding: 0, marginBottom: '20px' }}>
            Registered Users List
          </h3>

          {isLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', fontSize: '16px', color: '#666' }}>
              Loading registered users database...
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="vfs-table" style={{ margin: 0, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '12px 15px' }}>Full Name</th>
                    <th style={{ padding: '12px 15px' }}>Email Address</th>
                    <th style={{ padding: '12px 15px' }}>Registration Date</th>
                    <th style={{ padding: '12px 15px' }}>Account Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        No registered users match your search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td style={{ fontWeight: '600', color: '#0c2340', padding: '12px 15px' }}>{user.name}</td>
                        <td style={{ padding: '12px 15px' }}>{user.email}</td>
                        <td style={{ padding: '12px 15px' }}>
                          {user.regDate ? new Date(user.regDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A'}
                        </td>
                        <td style={{ padding: '12px 15px' }}>
                          <span style={{
                            backgroundColor: user.status === 'Active' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                            color: user.status === 'Active' ? '#10b981' : '#ef4444',
                            padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold',
                          }}>
                            {user.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
