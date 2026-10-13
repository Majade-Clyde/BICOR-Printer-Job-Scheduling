import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Mail, Lock, LogIn, ArrowRight, ShieldCheck
} from 'lucide-react';
import ErrorMessage from '../components/ErrorMessage';

const Login = () => {
  const { login, isConfigured } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please provide both your email and password.');
      return;
    }

    setLoading(true);

    try {
      const result = await login(email, password);
      const userRole = result?.profile?.role || 'student';

      // Automatic role-based redirect – no manual selection needed
      if (userRole === 'admin') {
        navigate('/admin/dashboard');
      } else if (userRole === 'staff' || userRole === 'operator') {
        navigate('/staff/dashboard');
      } else {
        navigate('/student/dashboard');
      }
    } catch (err) {
      console.error('Login error:', err);
      const errMsg = err?.message || String(err);
      if (errMsg.includes('Invalid login credentials') || errMsg.includes('invalid_credentials')) {
        setError('Invalid email or password. Please verify your credentials.');
      } else if (errMsg.includes('Failed to fetch') || errMsg.toLowerCase().includes('fetch') || errMsg.includes('NetworkError')) {
        setError('Unable to connect to the authentication server. Please check your internet connection and verify that your Supabase project in .env is active and reachable.');
      } else if (errMsg.includes('Email not confirmed')) {
        setError('Please verify your email address before signing in.');
      } else {
        setError(errMsg || 'An error occurred during login. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container login-auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo-container">
            <img
              src="/bicor-logo.png"
              alt="BICOR Logo"
              className="auth-bicor-logo"
            />
          </div>
          <h2 className="auth-title">BICOR Printer Job Scheduling</h2>
        </div>

        {!isConfigured && (
          <div className="config-warning-box">
            <ShieldCheck size={22} />
            <div>
              <strong>Supabase Setup Required:</strong>
              <p>Add your project credentials to <code>.env</code> file to enable authentication.</p>
            </div>
          </div>
        )}

        <ErrorMessage message={error} onDismiss={() => setError('')} />

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="loginEmail">
              <Mail size={20} />
              <span>Email Address</span>
            </label>
            <input
              id="loginEmail"
              type="email"
              className="form-input"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="loginPassword">
              <Lock size={20} />
              <span>Password</span>
            </label>
            <input
              id="loginPassword"
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block auth-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <span className="btn-loading">Signing in...</span>
            ) : (
              <>
                <LogIn size={22} />
                <span>Log In</span>
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p className="auth-switch-text">
            Don't have an account?{' '}
            <Link to="/register" className="auth-link">
              <span>Register here</span>
              <ArrowRight size={18} className="auth-link-icon" />
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
