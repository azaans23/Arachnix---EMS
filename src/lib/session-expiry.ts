/**
 * Coordination point between the fetch interceptor (which detects an expired
 * Bearer token) and the session prompt (which asks the user to extend or sign
 * out). Kept outside React so a 401 raised during a page's first render can
 * still reach the prompt.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

let open = false;
let pending: Promise<boolean> | null = null;
let settle: ((renewed: boolean) => void) | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

export const sessionExpiryStore = {
  isOpen: (): boolean => open,

  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * Opens the prompt and resolves once the user answers: `true` when the session
 * was renewed, `false` when it could not be. Requests that expire together
 * share a single prompt and a single answer.
 */
export function requestSessionRenewal(): Promise<boolean> {
  if (!pending) {
    pending = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    open = true;
    emit();
  }
  return pending;
}

export function completeSessionRenewal(renewed: boolean) {
  const resolve = settle;
  pending = null;
  settle = null;
  open = false;
  emit();
  resolve?.(renewed);
}
