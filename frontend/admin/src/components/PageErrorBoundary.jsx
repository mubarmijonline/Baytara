// A page that throws while rendering used to take the whole admin down to a white screen
// with nothing to read and nothing to click -- the client's report was "the videos icon
// doesn't open at all". One bad page should cost that page, not the panel.
import { Component } from 'react';

const COPY = {
  ar: {
    heading: 'الصفحة دي وقعت',
    body: 'في خطأ منعها من الفتح. باقي لوحة التحكم شغالة، وتقدر ترجع وتجرب تاني.',
    retry: 'حاول تاني',
  },
  en: {
    heading: 'This page failed to open',
    body: 'Something in it threw. The rest of the panel still works, and you can try again.',
    retry: 'Try again',
  },
};

export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // Nothing ships this anywhere; the console is where whoever is looking will look.
    console.error('admin page crashed', error); // eslint-disable-line no-console
  }

  // A route change should give the page another chance, otherwise the whole session is
  // stuck on one bad screen until a reload.
  componentDidUpdate(previous) {
    if (this.state.error && previous.routeKey !== this.props.routeKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const copy = COPY[this.props.language] || COPY.ar;
    return (
      <section className="catalog-panel">
        <h2>{copy.heading}</h2>
        <p style={{ color: 'var(--muted, #6b6b80)' }}>{copy.body}</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#b3261e', direction: 'ltr', textAlign: 'start' }}>
          {String(this.state.error?.message || this.state.error)}
        </pre>
        <button className="btn btn-filled btn-sm" type="button" onClick={() => this.setState({ error: null })}>
          {copy.retry}
        </button>
      </section>
    );
  }
}
