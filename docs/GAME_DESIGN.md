# CLAUDE.md — Game "Shop Bán Bánh Mì"

Tài liệu này mô tả ý tưởng, luật chơi, các tình huống và hướng làm kỹ thuật cho game 3D chạy trên web. Claude đọc file này trước khi viết code để hiểu game cần làm gì.

---

## 1. Tổng quan

- **Thể loại**: Game 3D mô phỏng phục vụ/bán hàng, phong cách bựa, nhây, gây cay cú.
- **Vai người chơi**: Nhân viên phục vụ ở một tiệm bánh mì.
- **Nền tảng**: Trình duyệt web (desktop trước, mobile sau).
- **Tone**: Hài đen, phóng đại, thoại cà khịa kiểu Việt Nam. Hậu quả luôn hài hước (hoạt ảnh bị tát phóng đại, nhạc tắt rụp, bình luận cà khịa).
- **Triết lý thiết kế**: Cay là do mình **quên hoặc chậm**, không phải do game ăn gian. Mọi sự cố đều có (1) dấu hiệu báo trước, (2) cách khắc phục, (3) hậu quả rõ ràng.

### Vòng lặp cốt lõi (core loop)
1. Khách vào quán → ngồi bàn → gọi món (hoặc không gọi).
2. Người chơi làm bánh mì / mang menu / bưng đồ.
3. Khách ăn xong → ra quầy thanh toán (hoặc bỏ đi quỵt).
4. Người chơi **ghi sổ tay** mỗi lần thanh toán.
5. Chủ quán đi tuần, kiểm tra sổ, phạt nếu sai sót.
6. Giữa chừng: mèo thức dậy, sự cố bếp, khách nhây xuất hiện.

---

## 2. Công nghệ

| Hạng mục | Lựa chọn |
|---|---|
| Engine 3D | **Three.js** (hoặc Babylon.js nếu muốn nhiều tính năng có sẵn) |
| Build | **Vite** + TypeScript |
| Vật lý | Chỉ cần va chạm đơn giản (AABB/raycast). Chỉ dùng **Rapier** nếu thật sự cần vật lý |
| Âm thanh | **Howler.js** |
| UI | HTML/CSS đè lên canvas (HUD, sổ tay, menu) |
| Lưu dữ liệu | `localStorage` (ca đã qua, kỷ lục, số lần bị đuổi) |
| Model 3D | Low-poly từ Kenney.nl / Quaternius, hoặc khối hộp tự dựng (hợp phong cách bựa) |
| Deploy | Netlify / GitHub Pages / itch.io |

### Cấu trúc thư mục đề xuất
```
src/
  main.ts                 # khởi tạo, vòng lặp game
  core/
    Game.ts               # quản lý trạng thái tổng (ca làm, lương, thời gian)
    EventBus.ts           # phát/nhận sự kiện giữa các hệ thống
    Timer.ts              # bộ đếm giờ dùng chung
  world/
    Restaurant.ts         # dựng quán: quầy, bàn, bếp, cửa
    Player.ts             # nhân vật + điều khiển
  entities/
    Customer.ts           # khách + máy trạng thái
    Boss.ts               # chủ quán + tâm trạng + đi tuần
    Cat.ts                # mèo + trạng thái
    Gang.ts               # nhóm giang hồ
  systems/
    OrderSystem.ts        # đơn hàng, món ăn
    PaymentSystem.ts      # thanh toán, sổ tay
    SalarySystem.ts       # lương, phạt
    ConsequenceSystem.ts  # hậu quả: tát, nhập viện, đuổi việc
    SpawnSystem.ts        # sinh khách theo độ khó của ca
  ui/
    Hud.ts                # thanh lương, thanh chủ bực, đồng hồ
    Notebook.ts           # sổ tay ghi chép thanh toán
    DialogBubble.ts       # thoại nổi trên đầu nhân vật
    ReviewScreen.ts       # màn review cuối ca
  data/
    menu.ts               # danh sách món
    dialogues.ts          # câu thoại cà khịa
    difficulty.ts         # bảng độ khó theo ca
public/
  models/ sounds/
```

---

## 3. Hệ thống tổng thể

### 3.1 Các chỉ số (stats)
- **Lương** (`salary`): bắt đầu mỗi ca ở mức cố định (ví dụ 100). Mỗi lỗi bị trừ. Về 0 → bị đuổi việc.
- **Chủ quán bực** (`bossAnger`, 0–100): tăng theo lỗi và theo thời gian. Đầy → chủ quán tát/phạt nặng, sau đó reset về mức thấp.
- **Rating quán** (`rating`, 1–5 sao): khách bực để lại review, ảnh hưởng điểm cuối ca.
- **Mèo ngủ** (`catSleep`, 0–100): giảm dần, càng thấp mèo càng gần thức dậy.
- **Số lần bị đuổi/bị đánh**: hiển thị cuối game để khoe hoặc tự hành.

### 3.2 Hệ thống ca làm
- Mỗi ngày là một ca (ví dụ 5–8 phút thật).
- Độ khó tăng theo ngày: khách đông hơn, sự cố dày hơn, thêm tình huống mới.
- Sự kiện đặc biệt theo ngày: ngày mưa, ngày lễ, ngày có đội bóng đến ăn, ngày thanh tra.
- Chủ quán có **tâm trạng ngẫu nhiên** mỗi ngày (vui / bình thường / cáu vì vợ chồng cãi nhau), ảnh hưởng ngưỡng nổi giận.

### 3.3 Hai loại hậu quả
| Loại | Hậu quả | Kết thúc ca? |
|---|---|---|
| **Nhẹ** | Trừ lương, chủ quán tát | Không |
| **Nặng** | Đuổi việc (mèo bị bế đi), nhập viện (bị giang hồ đánh) hoặc cháy quán (chảo cháy lan) | Có → vào màn Game Over |

Chơi lại phải **nhanh**: bấm một nút là vào lại ca (dưới 2 giây), không bắt xem màn hình dài.

---

## 4. Các tình huống chính (đặc tả chi tiết)

Mỗi tình huống theo mẫu: **Kích hoạt → Dấu hiệu báo trước → Cách khắc phục → Hậu quả**.

---

### Tình huống 1: Khách ăn quỵt

**Kích hoạt**
- Khách ăn xong, ngồi tại bàn. Với xác suất tùy độ khó, khách quyết định "chuồn".
- Khách có trạng thái `EATING → FINISHED → (PAYING | RUNNING_AWAY)`.

**Dấu hiệu báo trước**
- Khách ăn xong nhưng **không đứng lên đi về phía quầy**, mà liếc nhìn cửa (animation đảo mắt).
- Bong bóng thoại nhỏ: "Ê, đi thôi…", hoặc tiếng cười khúc khích.
- Biểu tượng "?" mờ nhấp nháy trên đầu khách.

**Cách khắc phục**
- Người chơi **chạy theo khách ra cửa** và bấm phím tương tác (ví dụ `E`) để nhắc trả tiền.
- Có **giới hạn thời gian**: khách đi ra khỏi vùng cửa trong khoảng 5–8 giây. Khách đi khuất tầm → coi như mất.
- Nhắc thành công: khách làm mặt khó chịu, quay lại quầy trả tiền (vẫn phải ghi sổ).

**Hậu quả khi không nhắc kịp**
- Trừ lương bằng giá trị bữa ăn (hoặc gấp đôi).
- Chủ quán biết (qua camera/đếm tiền cuối ca hoặc nhìn thấy trực tiếp) → chạy tới **tát** người chơi.
- Tăng `bossAnger`.

**Ghi chú kỹ thuật**
- Mỗi khách có `paymentIntent: 'pay' | 'skip'` quyết định lúc ăn xong.
- Dùng `raycast`/khoảng cách để kiểm tra người chơi đủ gần khách khi bấm `E`.
- Hoạt ảnh khách chạy: tăng tốc độ di chuyển, tiếng cười đắc ý.

---

### Tình huống 2: Con mèo và vị khách bế mèo

**Mô tả**
Quán nuôi một con mèo. Mèo có thanh ngủ giảm dần. Một nhóm khách (hoặc một khách đặc biệt) có thể tiện tay **bế mèo đi** khi ra về.

**Trạng thái mèo**
```
SLEEPING → (catSleep thấp) WAKING_UP → WANDERING → (bị bế đi bởi khách) STOLEN
         ↑                                     |
         └──── người chơi bế + vuốt ve ←───────┘
```

**Dấu hiệu báo trước**
- Mèo bắt đầu **vươn vai**, kêu "meo" nhỏ.
- Icon mèo trên HUD đổi màu (xanh → vàng → đỏ) theo `catSleep`.
- Khi mèo đi lang thang, nó tiến gần cửa hoặc gần khách.

**Cách khắc phục**
- Mỗi lần mèo thức dậy/bỏ đi, người chơi phải **chạy tới bế mèo** (phím `E` giữ), đặt mèo xuống ổ, rồi **vuốt ve** (giữ chuột/phím, hoạt ảnh vuốt) cho tới khi thanh ngủ đầy lại.
- Vuốt chưa đủ mà bỏ → mèo lại dậy nhanh hơn.
- Vuốt **quá lâu** (tùy chọn nâng cao): mèo cáu, cào người chơi → trừ lương nhẹ.

**Kịch bản mèo bị bế đi**
1. Một khách (đánh dấu `catThief = true` ở ca nhất định) ăn xong, đi tới chỗ mèo. Mèo **đang ngủ cũng bị trộm**: dấu hiệu là khách đứng sát mèo 4 giây (👀🐈) mà không đi; cách khắc phục là **vuốt ve mèo** (khách bỏ cuộc). Mèo thức/lang thang thì bị bế ngay.
   - Thanh ngủ của mèo **không hiện** cho người chơi; dấu hiệu duy nhất mèo sắp dậy là vươn vai + tiếng meo.
2. Khách ngó nghiêng, bế mèo, bỏ vào túi/áo rồi đi ra cửa (có thể kèm câu "Ê con mèo xinh quá").
3. Người chơi có cửa sổ thời gian ngắn để chặn lại.

**Hậu quả khi bị bế đi mất**
- Chủ quán phát hiện → **đánh** → **đuổi việc** → Game Over (ending "Mất mèo").
- Có thể cho một cơ hội cuối (chạy theo thu hồi trong 5 giây), tùy độ khó.

**Nâng cấp sau này**
- Mèo ăn trộm thịt, nhảy lên bàn bếp.
- Khách tráo mèo giả (nhận ra qua màu mắt/đốm lông).
- Chó hàng xóm gây xung đột với mèo.

---

### Tình huống 3: Nhóm giang hồ không gọi món

**Kích hoạt**
- Từ một ca nhất định trở đi, có xác suất xuất hiện một nhóm 3–4 người xăm trổ, bước vào đẩy cửa mạnh, ngồi một bàn lớn.

**Dấu hiệu báo trước**
- Nhạc nền đổi sang tiết tấu căng thẳng.
- Cửa bị đạp mạnh, âm thanh gầm gừ.
- Một biểu tượng cảnh báo đỏ hiện lên ở bàn nhóm giang hồ.

**Đặc điểm**
- Nhóm ngồi xuống nhưng **không nói món gì**, chỉ nhìn chằm chằm người chơi.
- Người chơi phải **tự đoán món** hoặc làm đúng việc.

**Cách khắc phục chính (đúng)**
- Người chơi **lấy menu** (đặt ở một chỗ cố định trong quán, ví dụ quầy hoặc kệ bên tường), mang tới bàn nhóm giang hồ.
- Đưa menu xong → nhóm gọi món → bình thường hóa (vẫn phải làm nhanh, họ không kiên nhẫn).

**Cách khác (đoán món)**
- Nếu người chơi cố đoán và mang bánh mì ra, xác suất đúng thấp (ví dụ 20%). Đoán sai → họ nổi giận ngay.

**Giới hạn thời gian**
- **20 giây** kể từ khi nhóm ngồi xuống. Thanh đếm ngược hiện trên đầu nhóm.

**Hậu quả khi quá 20 giây không giải quyết**
- Nhóm giang hồ đứng dậy, **đánh người chơi**.
- Người chơi **nhập viện** → **nghỉ làm** → **Game Over** (ending "Nhập viện").
- Màn hình hoạt ảnh hài hước: tiếng còi xe cứu thương, bình luận review "nhân viên yếu quá".

**Ghi chú kỹ thuật**
- Menu là một đối tượng có thể nhặt (`Pickable`), người chơi mang trên tay.
- Nhóm giang hồ dùng chung một máy trạng thái: `ENTERING → SITTING → WAITING_MENU → ORDERING → EATING → LEAVING | ATTACKING`.

---

### Tình huống 4: Thanh toán và sổ tay

**Kích hoạt**
- Khách ăn xong, bước tới **quầy thanh toán**, đặt tiền/đưa thẻ.

**Yêu cầu**
- Mỗi lần khách thanh toán, người chơi phải **mở sổ tay và ghi lại** (số bàn, món, số tiền).
- Sổ tay là UI riêng (bật bằng phím `N` hoặc click vào quyển sổ trên quầy), có ô nhập đơn giản (chọn bàn + chọn món/giá) để tránh phải gõ chữ.

**Dấu hiệu báo trước**
- Khi khách đứng ở quầy, có biểu tượng cây bút nhấp nháy, nhắc phải ghi.
- Nếu chưa ghi mà khách rời quầy, icon chuyển đỏ.

**Cách khắc phục**
- Ghi sổ **trước khi** hoặc **ngay sau khi** nhận tiền, trong vòng vài giây.
- Ghi đúng (đúng bàn, đúng số tiền) thì không sao.

**Hậu quả**
- Chủ quán thỉnh thoảng đi tới quầy **hỏi bất ngờ**: "Bàn 3 trả bao nhiêu?"
- Nếu sổ **thiếu hoặc sai** → **trừ lương + chủ quán tát**.
- **Không** bị đuổi việc vì lỗi này (đây là lỗi mức "nhẹ").

**Mở rộng**
- Khách bảo "tính sai tiền" → người chơi phải lật sổ chứng minh.
- Khách đưa tờ tiền mệnh giá lớn, quầy hết tiền lẻ → chạy đổi tiền.
- Tiền giả: có dấu hiệu nhỏ (màu, hình), nhận ra thì từ chối.

---

### Tình huống 5: Chủ quán đi tuần (tình huống nền)

**Nhân vật**: ông chủ tên **dkhanh** (bảng tên đỏ trên đầu), là người thật đi lại trong quán, không phải giọng hét.
- **Ca 1**: dkhanh không đi tuần, chỉ thỉnh thoảng bước từ cửa vào quầy kiểm sổ, xong đi ra. Không có thanh bực.
- **Ca 2+**: đi tuần đầy đủ như bên dưới.

**Bị tát**: bàn tay to đập lên màn hình, nhân viên văng ra, **ngã ngửa → nằm → đứng dậy**. Không điều khiển được cho tới khi đứng dậy xong (thời gian chỉnh ở `slapFallSec`, `slapLieSec`, `slapGetUpSec` trong `difficulty.ts`).

**Nhây**
- Mỗi cái tát ông luôn nói đúng một câu: **"M hả bưởi, làm được việc ko?"**.
- Chào đầu ca theo tâm trạng; nếu bạn từng bị đuổi thì cà khịa theo số lần bị đuổi.
- Từ ca 3: thấy bạn đang **bưng đồ** trong tầm nhìn, thỉnh thoảng ông nhảy ra **hỏi sổ bất ngờ** ngay tại chỗ, bạn phải bỏ việc, mở sổ (`N`) ghi cho đúng trong vài giây.

**Hành vi**
- Chủ quán di chuyển ngẫu nhiên theo lộ trình, dừng ở quầy, bếp, bàn ăn.
- Có **tiếng dép lê** báo hiệu khi tiến lại gần.

**Chức năng**
- Kiểm tra sổ tay.
- Bắt quả tang người chơi nhàn rỗi, lướt điện thoại.
- Chứng kiến mèo bị bế đi, khách quỵt → là tác nhân gây ra hậu quả.

**Chủ quán bực (`bossAnger`)**
- Tăng khi có lỗi hoặc theo thời gian.
- Khi đầy: chủ quán lao tới, **tát/phạt**, sau đó giảm lại.

---

## 5. Các tình huống mở rộng (làm sau khi lõi ổn)

| Tình huống | Dấu hiệu | Khắc phục | Hậu quả |
|---|---|---|---|
| Khách đổi ý sau khi bánh làm xong | Khách vẫy tay gọi lại | Gỡ hành/làm lại | Chậm, trừ điểm |
| Khách đòi giảm giá | Bong bóng "Quen mà!" | Chiều hoặc từ chối | Chiều → trừ lương; từ chối → rating giảm |
| ✅ Hết nguyên liệu (pate, dưa leo, gas) — ca 8 | Icon cạn trên kệ, thông báo sắp hết | Chạy tới quầy chợ trong quán (cạnh cửa) mua, cất lên kệ bếp | Món cần nguyên liệu đó không làm được, khách chờ cáu |
| ✅ Chảo bốc cháy — ca 6 | Khói đen, tiếng dầu xèo, thông báo | Lấy **bình cứu hỏa** ở kệ bếp, xịt vào bếp (E), rồi **cất bình lại** (không cất mà chủ quán thấy → ăn tát, chỉ tát). Tạt nước thì bùng to + trừ lương | Cháy lan = **cháy quán** (kết thúc ca, chơi lại) |
| Bánh nướng quá lửa | Tiếng "xèo" đổi, mùi khét | Lấy ra đúng lúc | Bánh hỏng, mất khách |
| Chuột/gián trong bếp | Bóng chạy qua, tiếng kêu | Đuổi/đập | Thanh tra thấy → phạt nặng |
| ✅ Thanh tra vệ sinh — ca 10 | Xe lạ đỗ trước quán, đếm ngược, các chỗ bẩn 🧽 hiện ra | Lau hết chỗ bẩn trước khi thanh tra vào | Phạt tiền theo số chỗ bẩn, mất rating, chủ quán bực |
| ✅ Shipper giục đơn — ca 7 | Còi xe bíp bíp, phiếu ƯU TIÊN chen lên đầu | Làm xong đơn, đưa tận tay shipper ở cửa | Shipper hủy đơn, review xấu, trừ lương nhẹ, chủ quán bực |
| Đồng nghiệp nhây đổ lỗi | Tin nhắn bóng gió | Có bằng chứng (sổ tay) | Chủ quán tin sai → trừ lương |
| Nhóc con phá | Tiếng chạy, tiếng vỡ | Giữ trẻ lại | Đền ly vỡ |
| Khách ngồi lì chiếm bàn | Ngồi sau khi ăn xong lâu | Dọn bàn xung quanh, bật quạt | Khách xếp hàng bỏ đi |
| ✅ Mất điện — ca 9 (ngày mưa: chắc chắn có) | Đèn chớp, tiếng rè | Giữ `E` ở máy phát để nổ máy; thắp nến cho đỡ tối (bếp vẫn tắt) | Bếp không nướng được, màn hình tối, khách chờ cáu |

---

## 6. Máy trạng thái khách (mẫu)

```
ENTERING → SEATED → WAITING_ORDER → ORDERED → WAITING_FOOD → EATING → FINISHED
FINISHED → GO_TO_COUNTER → PAYING → LEAVING        (khách bình thường)
FINISHED → RUNNING_AWAY → GONE                     (khách quỵt)
WAITING_ORDER hết kiên nhẫn → LEAVING_ANGRY         (rating giảm)
```

Mỗi khách có thuộc tính: `patience`, `type` (thường / quỵt / nhây / giang hồ / thanh tra / trộm mèo), `order`, `paymentIntent`.

---

## 7. UI/HUD

- **Góc trên**: thanh Lương, thanh Chủ quán bực, đồng hồ ca, rating sao.
- **Góc dưới phải**: icon mèo (trạng thái ngủ).
- **Trên đầu nhân vật**: bong bóng thoại, icon cảnh báo, thanh đếm ngược.
- **Sổ tay**: bật bằng phím, dạng cuốn sổ, ghi bằng click chọn (không gõ phím).
- **Màn cuối ca**: bảng lương thực nhận, danh sách lỗi, review khách hài hước.
- **Game Over**: tên ending (Bị đuổi / Mất mèo / Nhập viện / Cháy quán), số lần chết, nút chơi lại lớn.

---

## 8. Phong cách nội dung (thoại, âm thanh)

- Thoại ngắn, giọng đời thường: "Em ơi, tính tiền!", "Ủa sao lương tui bị trừ?", "Anh quen mà, bớt đi!"
- **Thoại theo ngữ cảnh**: chết lần 1 một câu, chết lần 10 câu khác, chết đúng chỗ khó có câu riêng.
- Âm thanh: tiếng dép lê (chủ quán), tiếng meo, tiếng đập cửa (giang hồ), tiếng "bốp" khi bị tát, nhạc nền đổi theo mức độ nguy hiểm.
- Hậu quả cần **cường điệu hài hước**: nhạc tắt rụp, màn hình rung, chữ lớn "BỊ ĐUỔI!".

---

## 9. Cân bằng độ khó

| Ca | Nội dung mới |
|---|---|
| 1 | Chỉ khách thường + thanh toán + ghi sổ (hướng dẫn nhẹ) |
| 2 | Thêm chủ quán đi tuần |
| 3 | Thêm khách quỵt |
| 4 | Thêm mèo |
| 5 | Thêm nhóm giang hồ |
| 6 | Chảo bốc cháy |
| 7 | Shipper giục đơn |
| 8 | Hết nguyên liệu |
| 9 | Mất điện |
| 10+ | Thanh tra vệ sinh, kết hợp nhiều tình huống (sự cố nặng không chồng nhau: cháy / mất điện / giang hồ / thanh tra hoãn nhau) |

Quy tắc:
1. Mỗi tình huống mới được **giới thiệu riêng** trước khi trộn với tình huống khác.
2. Không để quá nhiều sự cố **nặng** chồng cùng lúc (trừ ca "Địa ngục" cố ý).
3. Luôn có **dấu hiệu báo trước** để người chơi thấy "lẽ ra mình làm kịp".
4. Hậu quả nặng (đuổi việc, nhập viện) chỉ xảy ra khi người chơi **bỏ qua rõ ràng** dấu hiệu.

---

## 10. Lộ trình làm (roadmap)

**Giai đoạn 1 — Prototype lõi (1–2 tuần)**
- [ ] Dựng quán đơn giản bằng khối hộp (quầy, 3–4 bàn, cửa).
- [ ] Nhân vật di chuyển góc nhìn thứ nhất hoặc thứ ba.
- [ ] Khách vào, ngồi, ăn, ra quầy thanh toán.
- [ ] Sổ tay + trừ lương khi sai.
- [ ] Chủ quán đi tuần + tát.

**Giai đoạn 2 — Các tình huống đặc trưng**
- [ ] Khách quỵt + đuổi theo.
- [ ] Mèo + bế + vuốt ve + khách bế mèo.
- [ ] Nhóm giang hồ + menu + 20 giây.

**Giai đoạn 3 — Hoàn thiện**
- [ ] Hệ thống ca, độ khó tăng dần, màn review.
- [ ] Model low-poly, hoạt ảnh, âm thanh.
- [ ] Thoại theo ngữ cảnh, thêm sự cố mở rộng.
- [ ] Lưu tiến trình, bảng thống kê số lần chết.

**Giai đoạn 4 — Xuất bản**
- [ ] Tối ưu hiệu năng, hỗ trợ mobile (nếu cần).
- [ ] Deploy Netlify/itch.io, làm trailer ngắn để quay clip chia sẻ.

---

## 11. Quy ước code (cho Claude khi viết)

- Dùng **TypeScript**, tách mỗi hệ thống thành module riêng như cấu trúc ở mục 2.
- Mỗi thực thể (khách, mèo, chủ quán, giang hồ) dùng **máy trạng thái** rõ ràng, không viết `if` rối.
- Giao tiếp giữa hệ thống qua **EventBus** (ví dụ `customer:paid`, `customer:ranAway`, `cat:stolen`, `boss:hit`).
- Mọi con số cân bằng (thời gian, mức trừ lương, xác suất) đặt trong `data/difficulty.ts`, không hard-code.
- Mọi câu thoại đặt trong `data/dialogues.ts` để dễ thêm/sửa.
- Ưu tiên **chạy được và chơi thử được** trước, tối ưu sau.
- Khi thêm tình huống mới, luôn viết đủ 4 phần: kích hoạt, dấu hiệu báo trước, cách khắc phục, hậu quả.
- Tránh dùng vật lý nặng nếu không cần; dùng raycast và khoảng cách cho tương tác.

---

## 12. Ý tưởng để mở rộng sau

- Chế độ "Ca địa ngục": mọi sự cố bật cùng lúc.
- Daily challenge: mỗi ngày một ca cố định giống nhau cho mọi người, có bảng xếp hạng.
- Nâng cấp vô dụng (mua quạt mới nhưng quạt thổi bay giấy tờ).
- Ending thêm: bỏ việc, lên chức quản lý rồi bị hành theo kiểu khác.
- Mở rộng sang xe đẩy bánh mì có công an phường kiểm tra.
