import React, { useState } from 'react';
import logo from '../sprinklers.png';
import { attemptSignIn, getSignInCount } from '../utils/auth';
import './LoginScreen.css';

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (attemptSignIn(username, password)) {
      setError('');
      onLogin();
    } else {
      setError('Incorrect username or password.');
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <img src={logo} alt="Irriguide Logo" className="login-logo" />
        <h1>Water Chommie</h1>
        <p className="login-subtitle">Sign in to view the vineyard dashboard.</p>

        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button type="submit">Sign In</button>

        <p className="login-count">
          Signed in {getSignInCount()} time{getSignInCount() === 1 ? '' : 's'} so far.
        </p>
      </form>
    </div>
  );
}
