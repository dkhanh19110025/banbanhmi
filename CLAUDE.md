# CLAUDE.md — Shop Bán Bánh Mì

Game 3D chạy trên web, phong cách bựa, nhây, gây cay cú. Người chơi là nhân viên phục vụ ở tiệm bánh mì: canh khách quỵt, dỗ con mèo, đối phó nhóm giang hồ, ghi sổ thanh toán, né chủ quán.

**Tài liệu thiết kế đầy đủ (luật chơi, tình huống, cân bằng, roadmap): @docs/GAME_DESIGN.md**
Đọc mục liên quan trong file đó trước khi làm bất kỳ tình huống nào. Đừng tự bịa luật.

## Công nghệ
- Three.js + TypeScript + Vite
- Howler.js cho âm thanh
- UI là HTML/CSS đè lên canvas (HUD, sổ tay, menu)
- Va chạm đơn giản bằng AABB/raycast. Không thêm engine vật lý nếu chưa hỏi.
- Lưu tiến trình bằng `localStorage`
- Model: khối hộp hoặc low-poly (Kenney.nl, Quaternius)

## Lệnh
```
npm install
npm run dev        # chạy thử, mở trên trình duyệt
npm run build      # build bản production
npm run lint       # kiểm tra lỗi
```
Sau khi sửa code, luôn chạy `npm run build` (và `npm run lint` nếu có) để chắc chắn không lỗi trước khi báo xong.

## Cấu trúc thư mục
```
src/
  main.ts            # khởi tạo, vòng lặp game
  core/              # Game, EventBus, Timer
  world/             # Restaurant, Player
  entities/          # Customer, Boss, Cat, Gang (mỗi cái một máy trạng thái)
  systems/           # Order, Payment, Salary, Consequence, Spawn
  ui/                # Hud, Notebook, DialogBubble, ReviewScreen
  data/              # menu.ts, dialogues.ts, difficulty.ts
public/models, public/sounds
docs/GAME_DESIGN.md
```

## Quy ước code
- Mỗi thực thể (khách, mèo, chủ quán, giang hồ) dùng **máy trạng thái** rõ ràng, không viết chuỗi `if` rối.
- Các hệ thống giao tiếp qua **EventBus** (ví dụ `customer:paid`, `customer:ranAway`, `cat:stolen`, `boss:hit`), không gọi chéo trực tiếp.
- **Mọi con số cân bằng** (thời gian, mức trừ lương, xác suất) đặt trong `src/data/difficulty.ts`, không hard-code.
- **Mọi câu thoại** đặt trong `src/data/dialogues.ts`.
- Không dùng `any`. Đặt tên rõ nghĩa, comment ngắn bằng tiếng Việt khi logic không hiển nhiên.
- Tương tác dùng raycast/khoảng cách, phím `E` để tương tác, `N` để mở sổ tay.

## Nguyên tắc thiết kế (bắt buộc giữ)
Mỗi sự cố trong game phải đủ 4 phần: **kích hoạt → dấu hiệu báo trước → cách khắc phục → hậu quả**. Cay phải do người chơi quên hoặc chậm, không do game ăn gian. Chơi lại phải nhanh (dưới 2 giây). Hậu quả luôn hài hước, cường điệu.

## Cách làm việc
- Làm **từng tình huống một**, chạy thử được rồi mới sang cái tiếp theo. Thứ tự: khung quán và khách thường → thanh toán và sổ tay → chủ quán đi tuần → khách quỵt → mèo → giang hồ.
- Việc lớn (thêm hệ thống mới, đổi kiến trúc): lên kế hoạch ngắn và hỏi trước khi code.
- Không thêm thư viện mới khi chưa hỏi.
- Ưu tiên **chạy được và chơi thử được** trước, tối ưu và làm đẹp sau.
- Cuối mỗi lần làm, nói ngắn gọn: đã làm gì, cách thử, và việc tiếp theo hợp lý.
- Nếu yêu cầu mâu thuẫn với `docs/GAME_DESIGN.md`, hỏi lại thay vì tự chọn.
