import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ errorInfo: info });
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '40px',
          color: 'var(--muted)',
          gap: '16px'
        }}>
          <div style={{ fontSize: '48px', opacity: 0.4 }}>!</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--red)' }}>Something went wrong</div>
          <div style={{ fontSize: '12px', maxWidth: '480px', textAlign: 'center' }}>
            {this.state.error.message}
          </div>
          {typeof window !== 'undefined' && import.meta.env?.DEV && this.state.errorInfo && (
            <pre style={{
              fontSize: '10px',
              maxWidth: '600px',
              maxHeight: '200px',
              overflow: 'auto',
              background: 'var(--surface)',
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              color: 'var(--muted)',
              textAlign: 'left',
            }}>
              {this.state.errorInfo.componentStack}
            </pre>
          )}
          <button
            className="btn btn-primary"
            onClick={() => {
              this.setState({ error: null, errorInfo: null });
              window.location.href = '/';
            }}
          >
            Return Home
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
