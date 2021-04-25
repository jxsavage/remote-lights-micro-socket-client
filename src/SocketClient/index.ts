import { scan } from './serial';

export default function initClient(): void {
  setInterval(scan, 3000);
}