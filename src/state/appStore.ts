import { createAppStore } from './store';
import { sampleProject } from '../model/sample';

/** Le store de l'application (un projet ouvert à la fois). */
export const useApp = createAppStore(sampleProject());
