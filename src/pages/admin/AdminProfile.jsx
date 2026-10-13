import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { User, Mail, Shield, Calendar, Save, CheckCircle, Camera } from 'lucide-react';
import ErrorMessage from '../../components/ErrorMessage';
import ChangePassword from '../../components/ChangePassword';

const AdminProfile = () => {
  const { user, profile, refreshProfile, avatarUrl, updateAvatar } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 256;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        updateAvatar(dataUrl);
      };
      img.src = event.target?.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) { setError('Full name is required.'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() })
        .eq('id', user.id);
      if (updateErr) throw updateErr;
      await refreshProfile();
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="page-container page-container-narrow">
      <div className="page-header">
        <h1 className="page-title">Admin Profile</h1>
        <p className="page-subtitle">View and update your administrator account information.</p>
      </div>

      <div className="card profile-card">
        <div className="profile-header">
          <div className="profile-avatar-column">
            <div className={`profile-avatar-large role-admin ${avatarUrl ? 'has-photo' : ''}`}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={profile?.full_name || 'Administrator'} className="profile-avatar-large-img" />
              ) : (
                <Shield size={36} />
              )}
            </div>
            <button
              type="button"
              className="btn-add-photo"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera size={15} />
              <span>{avatarUrl ? 'Change Photo' : 'Add Photo'}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoSelect}
              style={{ display: 'none' }}
              aria-label="Upload profile photo"
            />
          </div>
          <div className="profile-info">
            <h2 className="profile-name">{profile?.full_name || 'Administrator'}</h2>
            <span className="sidebar-role-pill role-admin">Administrator</span>
          </div>
        </div>

        <div className="profile-details-list">
          <div className="profile-detail-item">
            <div className="profile-detail-label">
              <User size={16} className="profile-detail-icon" />
              <span>Name</span>
            </div>
            <div className="profile-detail-value">
              {profile?.full_name || 'Administrator'}
            </div>
          </div>

          <div className="profile-detail-item">
            <div className="profile-detail-label">
              <Mail size={16} className="profile-detail-icon" />
              <span>Email</span>
            </div>
            <div className="profile-detail-value">
              {user?.email || profile?.email || '-'}
            </div>
          </div>

          <div className="profile-detail-item">
            <div className="profile-detail-label">
              <Shield size={16} className="profile-detail-icon" />
              <span>Role</span>
            </div>
            <div className="profile-detail-value">
              Admin
            </div>
          </div>

          <div className="profile-detail-item">
            <div className="profile-detail-label">
              <Calendar size={16} className="profile-detail-icon" />
              <span>Member Since</span>
            </div>
            <div className="profile-detail-value">
              {formatDate(profile?.created_at || user?.created_at)}
            </div>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-header"><h3 className="card-title">Edit Profile</h3></div>
        <ErrorMessage message={error} onDismiss={() => setError('')} />
        {success && (
          <div className="success-banner"><CheckCircle size={20} className="success-icon" /><span>{success}</span></div>
        )}
        <form onSubmit={handleSave} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="adminProfileName">
              <User size={16} /><span>Full Name</span>
            </label>
            <input id="adminProfileName" type="text" className="form-input" value={fullName} onChange={e => setFullName(e.target.value)} disabled={loading} required />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <Save size={16} /><span>{loading ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </form>
      </div>

      <ChangePassword />
    </div>
  );
};

export default AdminProfile;
