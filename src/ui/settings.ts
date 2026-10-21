import { t, type UiKey } from '../i18n';
import { DEFAULT_KEYS, type Action, type Settings } from '../storage';

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Space: 'Space',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift R',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl R',
  Escape: 'Esc',
  Enter: 'Enter',
};

export function keyLabel(code: string) {
  return KEY_LABELS[code] ?? code.replace(/^Key|^Digit|^Numpad/, '');
}

const RESERVED = new Set(['KeyM', 'KeyS', 'Digit1', 'Digit2']);

/** Renders the key-binding table and lets the player rebind by clicking + pressing a key. */
export function renderKeymap(el: HTMLElement, settings: Settings, onChange: () => void) {
  el.replaceChildren();
  for (const action of Object.keys(DEFAULT_KEYS) as Action[]) {
    const label = document.createElement('span');
    label.textContent = t(`action.${action}` as UiKey);
    const btn = document.createElement('button');
    btn.textContent = settings.keys[action].map(keyLabel).join(' / ');
    btn.addEventListener('click', () => {
      btn.classList.add('listening');
      btn.textContent = t('pressKey');
      const capture = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        window.removeEventListener('keydown', capture, true);
        if (e.code !== 'Escape' && !RESERVED.has(e.code)) {
          // A key can only do one thing: remove it from other actions first.
          for (const a of Object.keys(settings.keys) as Action[]) {
            settings.keys[a] = settings.keys[a].filter((k) => k !== e.code);
          }
          settings.keys[action] = [e.code];
          onChange();
        }
        renderKeymap(el, settings, onChange);
      };
      window.addEventListener('keydown', capture, true);
    });
    el.append(label, btn);
  }
}
