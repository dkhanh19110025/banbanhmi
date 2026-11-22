# 🥖 Shop Bán Bánh Mì 🔥

Game 3D chạy trên trình duyệt: bạn là nhân viên phục vụ ở một tiệm bánh mì — canh khách quỵt, dỗ con mèo, đối phó giang hồ, ghi sổ thanh toán và né chủ quán.

Thiết kế chi tiết: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)

## Chạy thử

```
npm install
npm run dev        # mở http://localhost:5173
```

Vào thẳng một ca: `http://localhost:5173/?ca=5`

| Ca | Có gì mới |
|---|---|
| 1 | Khách thường, thanh toán, ghi sổ |
| 2 | Chủ quán đi tuần + thanh bực + tát |
| 3 | Khách quỵt |
| 4 | Con mèo + khách trộm mèo |
| 5 | Nhóm giang hồ |
| 6+ | Trộn tất cả, khó dần, sự kiện ngày (mưa / lễ / đội bóng) |

## Điều khiển

`WASD` đi · `E` tương tác (giữ `E` để vuốt mèo) · `N` sổ tay · `Esc`/`P` tạm dừng · `M` tắt tiếng · `R` chơi lại

## Build & deploy

```
npm run build          # ra thư mục dist/ (đường dẫn tương đối, deploy đâu cũng chạy)
npm run lint
```

- **Netlify**: kéo thả thư mục `dist/` vào app.netlify.com/drop, hoặc nối repo — `netlify.toml` đã khai báo sẵn lệnh build và thư mục `dist`.
- **itch.io**: `npm run package:itch` → tạo `tiem-banh-mi-dia-nguc.zip`. Tạo project loại *HTML*, upload file zip, tick "This file will be played in the browser".
- **GitHub Pages**: đẩy nội dung `dist/` lên nhánh `gh-pages` (hoặc dùng GitHub Actions).

## Công nghệ

Three.js + TypeScript + Vite. UI là HTML/CSS đè lên canvas. Âm thanh và nhạc nền được tổng hợp bằng WebAudio (chưa dùng file âm thanh). Lưu tiến trình bằng `localStorage`.
