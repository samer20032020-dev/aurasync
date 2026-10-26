import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('AuraSync Uncaught UI Error:', error, errorInfo);
    this.setState({ errorInfo });
    try {
      if (typeof window !== 'undefined' && window.AuraSyncAndroid?.showToast) {
        window.AuraSyncAndroid.showToast('⚠️ خطأ في واجهة التطبيق: ' + (error?.message || 'غير معروف'));
      }
    } catch (_) {}
  }

  handleReload = () => {
    try {
      window.location.reload();
    } catch (_) {
      this.setState({ hasError: false, error: null });
    }
  };

  handleResetState = () => {
    try {
      localStorage.removeItem('aurasync_mobile_mode');
      localStorage.removeItem('aurasync_mobile_theme');
      window.location.reload();
    } catch (_) {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || String(this.state.error);
      return (
        <div
          dir="rtl"
          style={{
            minHeight: '100vh',
            width: '100vw',
            backgroundColor: '#090a0f',
            color: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 20px',
            fontFamily: "'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            boxSizing: 'border-box'
          }}
        >
          <div
            style={{
              maxWidth: 460,
              width: '100%',
              backgroundColor: '#111726',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: 20,
              padding: '28px 24px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
              textAlign: 'center'
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 30,
                margin: '0 auto 18px auto'
              }}
            >
              ⚠️
            </div>

            <h2
              style={{
                fontSize: 20,
                fontWeight: 800,
                margin: '0 0 10px 0',
                color: '#ffffff'
              }}
            >
              واجهة البرنامج واجهت مشكلة غير متوقعة
            </h2>

            <p
              style={{
                fontSize: 13,
                color: '#94a3b8',
                lineHeight: 1.6,
                margin: '0 0 22px 0'
              }}
            >
              تم حماية ملفاتك وبياناتك السحابية بنجاح. يمكنك استعادة التشغيل الفوري بضغطة زر واحدة أدناه.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
              <button
                onClick={this.handleReload}
                style={{
                  width: '100%',
                  padding: '13px 18px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)'
                }}
              >
                <span>🔄</span>
                <span>إعادة تشغيل التطبيق</span>
              </button>

              <button
                onClick={this.handleResetState}
                style={{
                  width: '100%',
                  padding: '11px 18px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: '#94a3b8',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: 12,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                إعادة ضبط الواجهة
              </button>
            </div>

            <div style={{ marginTop: 14, textAlign: 'right' }}>
              <button
                onClick={() => this.setState(prev => ({ showDetails: !prev.showDetails }))}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#60a5fa',
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: 4
                }}
              >
                {this.state.showDetails ? '▼ إخفاء تفاصيل الخطأ' : '◀ عرض تفاصيل الخطأ'}
              </button>

              {this.state.showDetails && (
                <div
                  dir="ltr"
                  style={{
                    marginTop: 10,
                    padding: 12,
                    backgroundColor: '#06080f',
                    borderRadius: 10,
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    maxHeight: 180,
                    overflowY: 'auto',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: '#f87171',
                    textAlign: 'left',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}
                >
                  {errorMsg}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
