import { Component, type ReactNode } from 'react';
import { flushSave } from '../state/project';

interface State {
  error: Error | null;
}

/**
 * Filet de sécurité : une erreur d'affichage ne laisse jamais une fenêtre blanche.
 * Le projet n'est pas touché (l'enregistrement automatique ne dépend pas de l'affichage).
 */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error('Erreur d’affichage', error);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h3>Un problème d’affichage est survenu{this.props.label ? ` (${this.props.label})` : ''}.</h3>
        <p>Votre projet n’est pas perdu : il reste enregistré automatiquement.</p>
        <p className="mono crash-detail">{this.state.error.message}</p>
        <div className="row">
          <button type="button" className="btn primary" onClick={() => this.setState({ error: null })}>
            Réessayer
          </button>
          <button type="button" className="btn" onClick={() => void flushSave().finally(() => location.reload())}>
            Recharger la fenêtre
          </button>
        </div>
      </div>
    );
  }
}
