import './styles/tokens.css';
import { mountPlate } from './title/plate';

declare global {
  interface Window {
    __done?: boolean;
    __stepTo?: (t: number) => Promise<void>;
  }
}

const app = document.getElementById('app')!;
mountPlate(app);

const still = new URLSearchParams(location.search).get('still') === '1';
if (still) {
  window.__stepTo = async () => {};
  void document.fonts.ready.then(() => {
    window.__done = true;
  });
}
