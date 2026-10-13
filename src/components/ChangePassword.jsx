import React, { useState } from 'react';
import { Lock, Save, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import ErrorMessage from './ErrorMessage';

const ChangePassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setPassword('');
      setConfirmPassword('');
      setSuccess('Password changed successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card mt-4">
      <div className="card-header">
        <h3 className="card-title">Change Password</h3>
      </div>
      <ErrorMessage message={error} onDismiss={() => setError('')} />
      {success && (
        <div className="success-banner">
          <CheckCircle size={20} className="success-icon" />
          <span>{success}</span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="form-group">
          <label className="form-label" htmlFor="newPassword">
            <Lock size={16} />
            <span>New Password</span>
          </label>
          <input
            id="newPassword"
            type="password"
            className="form-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="confirmNewPassword">
            <Lock size={16} />
            <span>Confirm New Password</span>
          </label>
          <input
            id="confirmNewPassword"
            type="password"
            className="form-input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          <Save size={16} />
          <span>{loading ? 'Changing...' : 'Change Password'}</span>
        </button>
      </form>
    </div>
  );
};

export default ChangePassword;