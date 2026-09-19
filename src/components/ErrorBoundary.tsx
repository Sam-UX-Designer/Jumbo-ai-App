import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * The last line between a rendering mistake and a white screen.
 *
 * Without one of these, a single bad value anywhere in the tree — a field
 * an API did not send, a record saved by an older version of the app —
 * unmounts everything and leaves a blank page with no way out. A person
 * loses the whole product, including the records they can still read, over
 * one screen that went wrong.
 *
 * So the fallback is deliberately modest: it says what happened in the
 * product's own words, offers the two things that actually help, and never
 * shows the error text. A stack trace is for the people who build Jumbo,
 * not for someone who opened it to log their lunch. It is written to the
 * console, where a developer can find it.
 */
interface Props {
  children: ReactNode
  /** Names the part that failed, so the message can be specific. */
  area?: string
  /** Lets a parent reset the boundary when the route changes. */
  resetKey?: string | number
}

interface State { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }
  private lastKey = this.props.resetKey

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Developer-facing only. Nothing here reaches the interface.
    console.error(`[jumbo] ${this.props.area ?? 'a screen'} failed to render`, error, info.componentStack)
  }

  componentDidUpdate() {
    // Moving to another screen clears the failure, so one broken screen does
    // not follow the person around the app.
    if (this.props.resetKey !== this.lastKey) {
      this.lastKey = this.props.resetKey
      if (this.state.failed) this.setState({ failed: false })
    }
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div className="stack stack-5" style={{ padding: 'var(--s-5) var(--s-4)' }}>
        <div className="card stack stack-4">
          <div className="stack stack-2">
            <span className="t-title3 strong">This part of Jumbo did not load</span>
            <p className="t-callout dim">
              Something went wrong drawing {this.props.area ?? 'this screen'}. Nothing you have
              recorded has been changed or lost — it is all still saved on this device.
            </p>
          </div>
          <div className="row" style={{ gap: 'var(--s-3)', flexWrap: 'wrap' }}>
            <button
              className="btn btn--primary"
              onClick={() => this.setState({ failed: false })}
            >
              Try again
            </button>
            <button
              className="btn btn--secondary"
              onClick={() => window.location.reload()}
            >
              Reload Jumbo
            </button>
          </div>
        </div>
      </div>
    )
  }
}
