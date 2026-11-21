import './style.css';
import { Game } from './core/Game';

const container = document.getElementById('app');
if (!container) throw new Error('Thiếu #app trong index.html');
const game = new Game(container);
// Game đã dựng xong cảnh → bỏ dòng "Đang nhóm lò…"
document.getElementById('boot')?.remove();

// Chỉ ở chế độ dev: mở console gõ `game` để soi trạng thái
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
