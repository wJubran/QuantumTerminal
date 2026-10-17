// version: v1
// PulseErrorBoundary.jsx — catches render-time exceptions in the Pulse Room
// component tree so a downstream bug shows a visible message instead of
// black-screening the whole sub-tab.

import React from "react";

export default class PulseErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("PulseRoom render error:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 40, fontFamily: "monospace", color: "#E04040",
          background: "#06060E", minHeight: 600,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12,
                        letterSpacing: 2, textTransform: "uppercase" }}>
            Pulse Room — render error
          </div>
          <div style={{ fontSize: 11, color: "#E8B84B", marginBottom: 16 }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          <pre style={{ fontSize: 10, color: "#9A7830",
                        whiteSpace: "pre-wrap", marginBottom: 16 }}>
            {this.state.error?.stack || ""}
          </pre>
          <button onClick={this.reset}
                  style={{ padding: "6px 12px", background: "transparent",
                           color: "#E8B84B", border: "1px solid #E8B84B",
                           cursor: "pointer", letterSpacing: 2,
                           fontFamily: "monospace", fontSize: 10,
                           textTransform: "uppercase" }}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
