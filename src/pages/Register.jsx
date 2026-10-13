import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, User, UserPlus, ArrowLeft, CheckCircle2 } from 'lucide-react';
import ErrorMessage from '../components/ErrorMessage';

const Register = () => {
  const { registerStudent, isConfigured } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validations
    if (!fullName.trim()) {
      setError('Please provide your Full Name.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setError('Please provide a valid email address.');
      return;
    }

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-type your password.');
      return;
    }

    setLoading(true);

    try {
      await registerStudent(email, password, fullName);
      setSuccess('Registration successful! Redirecting to user dashboard...');
      setTimeout(() => {
        navigate('/student');
      }, 1200);
    } catch (err) {
      console.error('Registration error:', err);
      const errMsg = err?.message || String(err);
      if (errMsg.includes('User already registered') || errMsg.includes('user_already_exists')) {
        setError('An account with this email already exists. Please log in instead.');
      } else if (errMsg.includes('Failed to fetch') || errMsg.toLowerCase().includes('fetch') || errMsg.includes('NetworkError')) {
        setError('Unable to connect to the authentication server. Please check your internet connection and verify that your Supabase project in .env is active and reachable.');
      } else {
        setError(errMsg || 'Registration failed. Please check your information and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container register-auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-container">
            <img
              src="/bicor-logo.png"
              alt="BICOR Logo"
              className="auth-bicor-logo"
            />
          </div>
          <h2 className="auth-title">Create User Account</h2>
        </div>

        <ErrorMessage message={error} onDismiss={() => setError('')} />

        {success && (
          <div className="success-banner" role="status">
            <CheckCircle2 size={22} className="success-icon" />
            <span>{typeof success === 'string' ? success : 'Account created successfully!'}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="registerName">
              <User size={20} />
              <span>Full Name</span>
              <span className="required-star">*</span>
            </label>
            <input
              id="registerName"
              type="text"
              className="form-input"
              placeholder="e.g. Maria Santos"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={loading || success}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="registerEmail">
              <Mail size={20} />
              <span>School Email</span>
              <span className="required-star">*</span>
            </label>
            <input
              id="registerEmail"
              type="email"
              className="form-input"
              placeholder="e.g. maria.santos@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || success}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="registerPassword">
              <Lock size={20} />
              <span>Password (min. 6 characters)</span>
              <span className="required-star">*</span>
            </label>
            <input
              id="registerPassword"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading || success}
              required
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirmPassword">
              <Lock size={20} />
              <span>Confirm Password</span>
              <span className="required-star">*</span>
            </label>
            <input
              id="confirmPassword"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading || success}
              required
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block auth-submit-btn"
            disabled={loading || success}
          >
            {loading ? (
              <span className="btn-loading">Creating Account...</span>
            ) : (
              <>
                <UserPlus size={22} />
                <span>Register</span>
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p className="auth-switch-text">
            Already have an account?{' '}
            <Link to="/login" className="auth-link">
              <ArrowLeft size={18} className="auth-link-icon" />
              <span>Back to Log In</span>
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
